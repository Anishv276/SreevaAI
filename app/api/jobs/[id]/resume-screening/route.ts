import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { putObject } from "@/lib/s3";
import { generateId } from "@/lib/ids";
import { getOrgBillingStatus } from "@/lib/credits";
import { getInterviewQuotaSupportMessage } from "@/lib/interview-quota";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { authorizeJobAccess } from "@/lib/job-access";
import { resumeQueue } from "@/lib/queue";

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

// POST /api/jobs/[id]/resume-screening -> upload resumes and queue processing
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || (!isAdminRole(session.role) && !isSuperAdminRole(session.role))) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }

    const { id: jobId } = await params;
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    console.log(`[RESUME-UPLOAD] Received ${files.length} file(s) for job=${jobId}`);

    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    if (files.length > MAX_RESUMES) {
      return NextResponse.json({ error: `Maximum ${MAX_RESUMES} resumes per upload` }, { status: 400 });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        organizationId: true,
        organization: { select: { urlSlug: true } },
      },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!job.organizationId) {
      return NextResponse.json({ error: "Job has no organisation" }, { status: 400 });
    }
    if (!isSuperAdminRole(session.role) && job.organizationId !== session.orgId) {
      return NextResponse.json({ error: "Job belongs to a different organization" }, { status: 403 });
    }

    const orgSlug = job.organization?.urlSlug || job.organizationId;
    const safeJobTitle = job.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

    const billingStatus = await getOrgBillingStatus(job.organizationId);
    if (billingStatus.interviewQuotaTotal > 0 && !billingStatus.hasSufficientInterviews) {
      return NextResponse.json(
        {
          error: getInterviewQuotaSupportMessage("interviews"),
          code: "NO_INTERVIEWS",
        },
        { status: 402 }
      );
    }

    // -- PHASE 1: Upload every PDF to R2, collecting successes ----------------
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
        const key = `resume/${orgSlug}/${safeJobTitle}/${Date.now()}_${index}_${safeName}`;
        const uploadedUrl = await putObject(RESUME_BUCKET, key, buffer, file.type || "application/pdf");
        const applicationId = `${generateId("app", guessNameFromFile(fileName))}-${randomUUID().slice(0, 8)}`;
        prepared.push({
          applicationId,
          fullName: guessNameFromFile(fileName),
          fileName,
          bucket: RESUME_BUCKET,
          key,
          uploadedUrl,
          downloadUrl: `/api/jobs/${jobId}/resume-screening/download?candidateId=${applicationId}`,
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

    // -- PHASE 2: Create all application rows in one transaction --------------
    try {
      await prisma.application.createMany({
        data: prepared.map((row) => ({
          id: row.applicationId,
          candidateFullName: row.fullName,
          candidateEmail: "",
          candidatePhone: "",
          resumeFileUrl: row.uploadedUrl,
          resumeAiScore: 0,
          resumeAiReport: buildProgressState(0, "waiting"),
          resumeRawText: null,
          resumeParsedData: JSON.stringify({
            source: { bucket: row.bucket, key: row.key, url: row.uploadedUrl, downloadUrl: row.downloadUrl },
          }),
          jobId,
          resumeFileName: row.fileName,
          resumeScreeningStatus: "waiting",
          interviewPhaseStatus: "pending",
        })),
      });
    } catch (dbErr: any) {
      console.error(`[RESUME-UPLOAD] DB persist failed: ${dbErr?.message}`);
      return NextResponse.json({ error: "Failed to persist candidates" }, { status: 500 });
    }

    const candidateIds = prepared.map((row) => row.applicationId);
    console.log(`[RESUME-UPLOAD] Persisted ${candidateIds.length} candidate(s) for job=${jobId}`);

    // -- Enqueue one screening job per resume immediately ----------------------
    // Each job is independent: the worker picks it up as soon as a concurrency
    // slot is free. No batch IDs, no batch tables -- just individual jobs.
    const enqueueResults = await Promise.allSettled(
      prepared.map((row) =>
        resumeQueue.add(
          "screen-resume",
          {
            applicationId: row.applicationId,
            bucket: row.bucket,
            key: row.key,
            fileName: row.fileName,
            orgId: job.organizationId,
          },
          {
            attempts: 2,
            backoff: { type: "exponential", delay: 5000 },
          },
        )
      )
    );

    // Reconcile DB status with the actual enqueue outcome. A candidate row is
    // created as "waiting" BEFORE the job is enqueued; if .add() rejects, the row
    // would otherwise hang on "waiting" forever with no job backing it. So we flip
    // any failed-to-enqueue row to "failed" immediately -- the UI never hangs.
    const failedToEnqueue: string[] = [];
    await Promise.all(
      enqueueResults.map((r, i) => {
        if (r.status === "fulfilled") {
          console.log(`[RESUME-UPLOAD] Enqueued screen-resume job id="${r.value.id}" for applicationId="${prepared[i].applicationId}" file="${prepared[i].fileName}"`);
          return Promise.resolve();
        }
        failedToEnqueue.push(prepared[i].applicationId);
        console.error(`[RESUME-UPLOAD] FAILED to enqueue job for "${prepared[i].fileName}": ${r.reason}`);
        return prisma.application.update({
          where: { id: prepared[i].applicationId },
          data: {
            resumeScreeningStatus: "failed",
            resumeAiReport: buildProgressState(0, "failed", { error: "Failed to enqueue screening job" }),
            applicationUpdatedAt: new Date(),
          },
        }).catch((e: any) => console.error(`[RESUME-UPLOAD] Could not mark ${prepared[i].applicationId} failed: ${e?.message}`));
      })
    );

    return NextResponse.json({
      totalCount: prepared.length,
      enqueuedCount: prepared.length - failedToEnqueue.length,
      candidateIds,
      ...(failedToEnqueue.length > 0 ? { failedToEnqueue } : {}),
      ...(uploadFailures.length > 0 ? { failedFiles: uploadFailures } : {}),
    });
  } catch (err) {
    console.error("[RESUME-SCREENING] POST error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET /api/jobs/[id]/resume-screening -> fetch all candidates
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const access = await authorizeJobAccess(jobId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const candidates = await prisma.application.findMany({
      where: { jobId },
      orderBy: { appliedAt: "asc" },
      select: {
        id: true,
        jobId: true,
        candidateFullName: true,
        resumeFileName: true,
        candidateEmail: true,
        candidatePhone: true,
        resumeAiScore: true,
        resumeAiReport: true,
        resumeScreeningStatus: true,
        appliedAt: true,
        applicationUpdatedAt: true,
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
