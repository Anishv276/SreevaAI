import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPresignedUploadUrl, headObjectStrict } from "@/lib/s3";
import { generateId } from "@/lib/ids";
import { getOrgBillingStatus } from "@/lib/credits";
import { getInterviewQuotaSupportMessage } from "@/lib/interview-quota";
import { authorizeJobAccess } from "@/lib/job-access";
import { resumeQueue } from "@/lib/queue";
import { isPdfExtension, MAX_RESUME_FILE_BYTES } from "@/lib/file-validation";
import { apiErrorResponse } from "@/lib/slack-error-logger";

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

// PUT /api/jobs/[id]/resume-screening -> generate presigned R2 upload URLs
// Client uploads files directly to R2 with these, then calls POST with the
// resulting keys once uploads finish. Server never touches file bytes.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const access = await authorizeJobAccess(jobId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { title: true, organization: { select: { urlSlug: true } } },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const files = (body?.files ?? []) as { fileName: string; fileSize: number }[];
    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    if (files.length > MAX_RESUMES) {
      return NextResponse.json({ error: `Maximum ${MAX_RESUMES} resumes per upload` }, { status: 400 });
    }

    const orgSlug = job.organization?.urlSlug || access.orgId;
    const safeJobTitle = job.title.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();

    const uploads = await Promise.all(
      files.map(async (f, index) => {
        if (!isPdfExtension(f.fileName)) {
          return { fileName: f.fileName, error: "Only .pdf files are accepted" };
        }
        if (f.fileSize > MAX_RESUME_FILE_BYTES) {
          return { fileName: f.fileName, error: `File too large (max ${MAX_RESUME_FILE_BYTES / (1024 * 1024)}MB)` };
        }
        const safeName = sanitizeFileName(f.fileName);
        const candidateFolder = sanitizeFileName(guessNameFromFile(f.fileName)).toLowerCase() || "candidate";
        const key = `resume/${orgSlug}/${safeJobTitle}/${candidateFolder}/${Date.now()}_${index}_${safeName}`;
        const putUrl = await getPresignedUploadUrl(RESUME_BUCKET, key, "application/pdf");
        return { fileName: f.fileName, key, putUrl };
      })
    );

    return NextResponse.json({ uploads });
  } catch (err) {
    return apiErrorResponse({
      route: "/api/jobs/[id]/resume-screening",
      method: "PUT",
      error: err,
      body: { error: "Failed to generate upload URLs" },
      status: 500,
      logLabel: "[RESUME-SCREENING] PUT error:",
    });
  }
}

// POST /api/jobs/[id]/resume-screening -> confirm direct-to-R2 uploads and queue processing
// Body: { files: [{ fileName, key }] } -- keys returned by the PUT step above.
// Verifies each object actually landed in R2 (HEAD) before trusting it, so a
// client that lies about a successful upload can't create a phantom job.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const access = await authorizeJobAccess(jobId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = await request.json().catch(() => null);
    const files = (body?.files ?? []) as { fileName: string; key: string }[];

    console.log(`[RESUME-UPLOAD] Confirming ${files.length} file(s) for job=${jobId}`);

    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    if (files.length > MAX_RESUMES) {
      return NextResponse.json({ error: `Maximum ${MAX_RESUMES} resumes per upload` }, { status: 400 });
    }

    const billingStatus = await getOrgBillingStatus(access.orgId);
    if (billingStatus.totalInterviewsAllowed > 0 && !billingStatus.hasSufficientInterviews) {
      return NextResponse.json(
        {
          error: getInterviewQuotaSupportMessage("interviews"),
          code: "NO_INTERVIEWS",
        },
        { status: 402 }
      );
    }

    // -- PHASE 1: Verify every claimed upload actually landed in R2 -----------
    type PreparedRow = {
      applicationId: string;
      fullName: string;
      fileName: string;
      bucket: string;
      key: string;
      uploadedUrl: string;
      downloadUrl: string;
    };

    const publicUrlBase = process.env.NEXT_PUBLIC_R2_RESUMES_URL || "";
    const prepared: PreparedRow[] = [];
    const uploadFailures: string[] = [];

    for (const file of files) {
      try {
        await headObjectStrict(RESUME_BUCKET, file.key);
        const applicationId = `${generateId("app", guessNameFromFile(file.fileName))}-${randomUUID().slice(0, 8)}`;
        const uploadedUrl = `${publicUrlBase.replace(/\/$/, "")}/${file.key}`;
        prepared.push({
          applicationId,
          fullName: guessNameFromFile(file.fileName),
          fileName: file.fileName,
          bucket: RESUME_BUCKET,
          key: file.key,
          uploadedUrl,
          downloadUrl: `/api/jobs/${jobId}/resume-screening/download?candidateId=${applicationId}`,
        });
      } catch (verifyErr: any) {
        uploadFailures.push(file.fileName);
        console.error(`[RESUME-UPLOAD] R2 verification failed for ${file.fileName} (key=${file.key}): ${verifyErr?.message}`);
      }
    }

    if (prepared.length === 0) {
      return NextResponse.json(
        { error: "All resume uploads failed verification", failedFiles: uploadFailures },
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
            orgId: access.orgId,
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
    return apiErrorResponse({
      route: "/api/jobs/[id]/resume-screening",
      method: "POST",
      error: err,
      body: { error: "Failed to process resume upload" },
      status: 500,
      logLabel: "[RESUME-SCREENING] POST error:",
    });
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
    return apiErrorResponse({
      route: "/api/jobs/[id]/resume-screening",
      method: "GET",
      error: err,
      body: { error: "Failed to fetch candidates" },
      status: 500,
      logLabel: "[RESUME-SCREENING] GET error:",
    });
  }
}
