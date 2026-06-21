import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { putObject } from "@/lib/s3";
import { generateId } from "@/lib/ids";
import { enqueueResumeJob } from "@/lib/resume-queue-publisher";
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

const MAX_RESUMES = 500;

// POST /api/drives/[id]/resume-screening -> upload resumes and queue processing
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
    if (files.length > MAX_RESUMES) {
      return NextResponse.json({ error: `Maximum ${MAX_RESUMES} resumes per upload` }, { status: 400 });
    }

    const drive = await prisma.drive.findUnique({
      where: { id: driveId },
      select: {
        id: true,
        title: true,
        orgId: true,
        organization: { select: { slug: true } },
      },
    });
    if (!drive) {
      return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    }
    if (!drive.orgId) {
      return NextResponse.json({ error: "Drive has no organisation" }, { status: 400 });
    }
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

    // ── PHASE 1: Upload every PDF to R2, collecting successes ────────────────
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
        const key = `resume/${orgSlug}/${safeDriveTitle}/${Date.now()}_${index}_${safeName}`;
        const uploadedUrl = await putObject(RESUME_BUCKET, key, buffer, file.type || "application/pdf");
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

    if (prepared.length === 0) {
      return NextResponse.json(
        { error: "All resume uploads failed", failedFiles: uploadFailures },
        { status: 502 }
      );
    }

    // ── PHASE 2: Create all application rows in one transaction ──────────────
    try {
      await prisma.application.createMany({
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
          fileName: row.fileName,
          resumeStatus: "waiting",
          interviewStatus: "pending",
          hiringStatus: "pending",
        })),
      });
    } catch (dbErr: any) {
      console.error(`[RESUME-UPLOAD] DB persist failed: ${dbErr?.message}`);
      return NextResponse.json({ error: "Failed to persist candidates" }, { status: 500 });
    }

    const candidateIds = prepared.map((row) => row.applicationId);
    console.log(`[RESUME-UPLOAD] Persisted ${candidateIds.length} candidate(s) for drive=${driveId}`);

    // ── PHASE 3: Enqueue one job for all candidates ──────────────────────────
    const jobId = await enqueueResumeJob({
      driveId,
      orgId: drive.orgId,
      candidateIds,
    });

    console.log(`[RESUME-UPLOAD] Job enqueued (verified) jobId=${jobId} candidates=${candidateIds.length}`);

    return NextResponse.json({
      totalCount: prepared.length,
      candidateIds,
      ...(uploadFailures.length > 0 ? { failedFiles: uploadFailures } : {}),
    });
  } catch (err) {
    console.error("[RESUME-SCREENING] POST error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET /api/drives/[id]/resume-screening -> fetch all candidates
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

    const candidates = await prisma.application.findMany({
      where: { driveId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        driveId: true,
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
    });

    return NextResponse.json(
      { candidates },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("[RESUME-SCREENING] GET error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
