import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { putObject } from "@/lib/s3";
import { generateId } from "@/lib/ids";
import { enqueueResumeBatch } from "@/lib/resume-queue-publisher";
import { getOrgBillingStatus } from "@/lib/credits";
import { getInterviewQuotaSupportMessage } from "@/lib/interview-quota";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { authorizeDriveAccess } from "@/lib/drive-access";
const RESUME_BUCKET = process.env.R2_RESUMES_BUCKET || "resumes";
function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function guessNameFromFile(fileName: string) {
  const noExt = fileName.replace(/\.[^/.]+$/, "");
  const readable = noExt.replace(/[_-]+/g, " ").trim();
  return readable || "Unknown";
}
function buildProgressState(progress: number, stage: string, extra?: Record<string, unknown>) {
  return JSON.stringify({
    processing: {
      progress,
      stage,
      ...extra,
    },
  });
}
// POST /api/drives/[id]/resume-screening -> queue worker batch
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // -- AUTH: admin/super-admin only. This route uploads + queues resumes and
    // bills the org, so it must never be callable anonymously.
    const session = await getSession();
    if (!session || (!isAdminRole(session.role) && !isSuperAdminRole(session.role))) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }
    const { id: driveId } = await params;
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    console.log(`[RESUME-UPLOAD] Received ${files.length} file(s) for drive=${driveId}`);
    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    const drive = await prisma.drive.findUnique({
      where: { id: driveId },
      select: {
        id: true,
        title: true,
        orgId: true,
        organization: { select: { slug: true } }
      },
    });
    if (!drive) {
      return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    }
    if (!drive.orgId) {
      return NextResponse.json({ error: "Drive has no organisation" }, { status: 400 });
    }
    // -- TENANT ISOLATION: a regular admin may only screen into their own org's
    // drives. SUPER_ADMIN may operate across orgs.
    if (!isSuperAdminRole(session.role) && drive.orgId !== session.orgId) {
      return NextResponse.json({ error: "Drive belongs to a different organization" }, { status: 403 });
    }
    const orgSlug = drive.organization?.slug || drive.orgId;
    const safeDriveTitle = drive.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const billingStatus = await getOrgBillingStatus(drive.orgId);
    if (billingStatus.interviewQuotaTotal > 0 && !billingStatus.hasSufficientInterviews) {
      return NextResponse.json(
        {
          error: getInterviewQuotaSupportMessage("interviews"),
          code: "NO_INTERVIEWS",
        },
        { status: 402 }
      );
    }
    const batch = await prisma.resumeBatch.create({
      data: {
        driveId,
        orgId: drive.orgId,
        totalCount: 0, // set to the ACTUAL created count after uploads — never to intent
        processedCount: 0,
        failedCount: 0,
        status: "QUEUED",
      },
    });
    console.log(`[RESUME-UPLOAD] Created batch ${batch.id} for drive=${driveId}`);
    // ── PHASE 1: Upload every PDF to R2 first, collecting successes. ──────────
    // A per-file R2 failure is skipped & reported — it must NOT leave a half-built
    // batch behind. We pre-generate IDs so the candidate<->application FK link is
    // known before any DB write.
    type PreparedRow = {
      applicationId: string;
      fullName: string;
      fileName: string;
      bucket: string;
      key: string;
      uploadedUrl: string;
      downloadUrl: string;
    };
    const prepared: PreparedRow[] = [];
    const uploadFailures: string[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const fileName = file.name || `resume_${index + 1}.pdf`;
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const safeName = sanitizeFileName(fileName);
        const key = `resume/${orgSlug}/${safeDriveTitle}/${batch.id}_${Date.now()}_${index}_${safeName}`;
        const uploadedUrl = await putObject(RESUME_BUCKET, key, buffer, file.type || "application/pdf");
        // Pre-generated, collision-free IDs so the candidate<->application link
        // is known before any DB write. UUID suffix guarantees uniqueness.
        const applicationId = `${generateId("app", guessNameFromFile(fileName))}-${randomUUID().slice(0, 8)}`;
        prepared.push({
          applicationId,
          fullName: guessNameFromFile(fileName),
          fileName,
          bucket: RESUME_BUCKET,
          key,
          uploadedUrl,
          downloadUrl: `/api/drives/${driveId}/resume-screening/download?candidateId=${applicationId}`,
        });
        console.log(`[RESUME-UPLOAD] Stored ${fileName} in R2 -> ${key}`);
      } catch (uploadErr: any) {
        uploadFailures.push(fileName);
        console.error(`[RESUME-UPLOAD] R2 upload failed for ${fileName}: ${uploadErr?.message}`);
      }
    }
    // If nothing uploaded, fail the batch cleanly — never enqueue an empty job.
    if (prepared.length === 0) {
      await prisma.resumeBatch.update({
        where: { id: batch.id },
        data: { status: "FAILED", totalCount: 0 },
      }).catch(() => {});
      return NextResponse.json(
        { error: "All resume uploads failed", failedFiles: uploadFailures },
        { status: 502 }
      );
    }
    // ── PHASE 2: Create all rows in ONE transaction via createMany. ──────────
    // Two bulk inserts (not 2×N individual creates) keep this fast even for 1000
    // resumes and well within transaction time limits. Either all rows land or
    // none do — no partial state. totalCount is the real count so completion math
    // is correct. On failure the batch is marked FAILED and we surface a 5xx.
    try {
      await prisma.$transaction([
        prisma.application.createMany({
          data: prepared.map((row) => ({
            id: row.applicationId,
            fullName: row.fullName,
            email: "",
            phone: "",
            resumeUrl: row.uploadedUrl,
            aiScore: 0,
            aiReport: buildProgressState(0, "waiting"),
            resumeText: null,
            resumeData: JSON.stringify({
              source: { bucket: row.bucket, key: row.key, url: row.uploadedUrl, downloadUrl: row.downloadUrl },
            }),
            driveId,
            bulkBatchId: batch.id,
            fileName: row.fileName,
            resumeStatus: "waiting",
            interviewStatus: "pending",
            hiringStatus: "pending",
          })),
        }),
        prisma.resumeBatch.update({
          where: { id: batch.id },
          data: { totalCount: prepared.length },
        }),
      ]);
    } catch (dbErr: any) {
      console.error(`[RESUME-UPLOAD] DB persist failed for batch ${batch.id}: ${dbErr?.message}`);
      await prisma.resumeBatch.update({
        where: { id: batch.id },
        data: { status: "FAILED" },
      }).catch(() => {});
      return NextResponse.json({ error: "Failed to persist candidates" }, { status: 500 });
    }
    const queuedIds = prepared.map((row) => row.applicationId);
    console.log(`[RESUME-UPLOAD] Persisted ${queuedIds.length} candidate(s) for batch ${batch.id}`);
    // ── PHASE 3: Durable, verified enqueue. ──────────────────────────────────
    // Throws if the job cannot be confirmed in Redis — we surface a 5xx rather
    // than telling the client "success" for a job that was lost.
    const jobIds = await enqueueResumeBatch({
      batchId: batch.id,
      driveId,
      orgId: drive.orgId,
      candidateIds: queuedIds,
    });
    console.log(`[RESUME-UPLOAD] Worker job(s) enqueued (verified) batchId=${batch.id} jobs=${jobIds.length} candidates=${queuedIds.length}`);
    return NextResponse.json({
      batchId: batch.id,
      totalCount: prepared.length,
      candidateIds: queuedIds,
      ...(uploadFailures.length > 0 ? { failedFiles: uploadFailures } : {}),
    });
  } catch (err) {
    console.error("[RESUME-SCREENING] POST error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
// GET /api/drives/[id]/resume-screening -> poll batch or fetch all
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: driveId } = await params;
    const access = await authorizeDriveAccess(driveId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId");
    if (batchId) {
      const batch = await prisma.resumeBatch.findFirst({
        where: { id: batchId, driveId, orgId: access.orgId },
        select: {
          id: true,
          driveId: true,
          orgId: true,
          status: true,
          totalCount: true,
          processedCount: true,
          failedCount: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
        },
      });
      if (!batch) {
        return NextResponse.json({ error: "Batch not found" }, { status: 404 });
      }
      return NextResponse.json(batch, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const [batches, candidates] = await Promise.all([
      prisma.resumeBatch.findMany({
        where: { driveId, orgId: access.orgId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          driveId: true,
          orgId: true,
          status: true,
          totalCount: true,
          processedCount: true,
          failedCount: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
        },
      }),
      prisma.application.findMany({
        where: { driveId, bulkBatchId: { not: null } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          driveId: true,
          bulkBatchId: true,
          fullName: true,
          fileName: true,
          email: true,
          phone: true,
          aiScore: true,
          aiReport: true,
          resumeStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);
    return NextResponse.json(
      { batches, candidates },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("[RESUME-SCREENING] GET error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
