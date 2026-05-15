import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { putObject } from "@/lib/s3";
import { resumeQueue } from "@/lib/queue";
import { generateId } from "@/lib/ids";
import { getOrgBillingStatus } from "@/lib/credits";
import { getInterviewQuotaSupportMessage } from "@/lib/interview-quota";

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
      },
    });

    if (!drive) {
      return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    }
    if (!drive.orgId) {
      return NextResponse.json({ error: "Drive has no organisation" }, { status: 400 });
    }

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
        totalCount: files.length,
        processedCount: 0,
        failedCount: 0,
        status: "QUEUED",
      },
    });
    console.log(`[RESUME-UPLOAD] Created batch ${batch.id} for drive=${driveId}`);

    const queuedIds: string[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const buffer = Buffer.from(await file.arrayBuffer());
      const safeName = sanitizeFileName(file.name || `resume_${index + 1}.pdf`);
      const key = `resumes/intake/${driveId}/${batch.id}/${Date.now()}_${index}_${safeName}`;
      const uploadedUrl = await putObject(
        RESUME_BUCKET,
        key,
        buffer,
        file.type || "application/pdf"
      );
      console.log(`[RESUME-UPLOAD] Stored ${file.name || safeName} in R2 -> ${key}`);

      const candidate = await prisma.resumeCandidate.create({
        data: {
          driveId,
          bulkBatchId: batch.id,
          fullName: guessNameFromFile(file.name || ""),
          fileName: file.name || safeName,
          resumeStatus: "waiting",
          aiScore: 0,
          aiReport: buildProgressState(0, "waiting"),
          resumeData: JSON.stringify({
            source: {
              bucket: RESUME_BUCKET,
              key,
              url: uploadedUrl,
            },
          }),
        },
      });

      const downloadUrl = `/api/drives/${driveId}/resume-screening/download?candidateId=${candidate.id}`;

      await prisma.application.create({
        data: {
          id: generateId("app", `${candidate.fullName}-${batch.id}-${index}`),
          fullName: candidate.fullName,
          email: "",
          phone: "",
          resumeUrl: uploadedUrl,
          aiScore: 0,
          aiReport: buildProgressState(0, "waiting"),
          resumeText: null,
          resumeData: JSON.stringify({
            source: {
              bucket: RESUME_BUCKET,
              key,
              url: uploadedUrl,
              candidateId: candidate.id,
              downloadUrl,
            },
          }),
          driveId,
          resumeStatus: "waiting",
          interviewStatus: "pending",
          hiringStatus: "pending",
        },
      });

      queuedIds.push(candidate.id);
      console.log(`[RESUME-UPLOAD] Candidate queued id=${candidate.id} name=${candidate.fullName}`);
    }

    await resumeQueue.add(
      "drive-resume-batch",
      {
        batchId: batch.id,
        driveId,
        orgId: drive.orgId,
      },
      {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 1500,
        },
      }
    );
    console.log(`[RESUME-UPLOAD] Worker job enqueued batchId=${batch.id} candidates=${queuedIds.length}`);

    return NextResponse.json({
      batchId: batch.id,
      totalCount: files.length,
      candidateIds: queuedIds,
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
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId");

    if (batchId) {
      const batch = await prisma.resumeBatch.findUnique({ where: { id: batchId } });
      if (!batch) {
        return NextResponse.json({ error: "Batch not found" }, { status: 404 });
      }
      return NextResponse.json(batch);
    }

    const [batches, candidates] = await Promise.all([
      prisma.resumeBatch.findMany({
        where: { driveId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.resumeCandidate.findMany({
        where: { driveId },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return NextResponse.json({ batches, candidates });
  } catch (err) {
    console.error("[RESUME-SCREENING] GET error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
