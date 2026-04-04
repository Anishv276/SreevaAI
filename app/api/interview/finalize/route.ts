import { NextResponse } from "next/server";
import { interviewFinalizationQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { interviewFinalizeSchema } from "@/lib/validation";

export const runtime = "nodejs";

async function persistInterviewUpdateRaw(params: {
  applicationId: string;
  recordingUrl?: string;
  transcript?: string;
  interviewStatus?: string;
}) {
  const { applicationId, recordingUrl, transcript, interviewStatus } = params;
  const finalStatus = interviewStatus || "COMPLETED";

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "Interview" (id, "applicationId", "accessToken", status, "interviewRecordingUrl", "interviewRecordedAt", "interviewTranscript", "completedAt", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, $1, 'finalize-upload', COALESCE($2::text, 'COMPLETED'), $3, CASE WHEN $3::text IS NOT NULL THEN NOW() ELSE NULL END, $4, CASE WHEN COALESCE($2::text, 'COMPLETED') = 'COMPLETED' THEN NOW() ELSE NULL END, NOW(), NOW())
    ON CONFLICT ("applicationId")
    DO UPDATE SET
      status = COALESCE($2::text, 'COMPLETED'),
      "interviewRecordingUrl" = COALESCE($3::text, "Interview"."interviewRecordingUrl"),
      "interviewRecordedAt" = CASE WHEN $3::text IS NOT NULL THEN NOW() ELSE "Interview"."interviewRecordedAt" END,
      "interviewTranscript" = COALESCE($4::text, "Interview"."interviewTranscript"),
      "completedAt" = CASE WHEN COALESCE($2::text, 'COMPLETED') = 'COMPLETED' THEN NOW() ELSE "Interview"."completedAt" END,
      "updatedAt" = NOW()
    `,
    applicationId,
    finalStatus,
    recordingUrl || null,
    transcript || null
  );

  await prisma.$executeRawUnsafe(
    `
    UPDATE "Assessment"
    SET
      "interviewRecordingUrl" = COALESCE($1::text, "interviewRecordingUrl"),
      "interviewRecordedAt" = CASE WHEN $1::text IS NOT NULL THEN NOW() ELSE "interviewRecordedAt" END,
      "interviewTranscript" = COALESCE($2::text, "interviewTranscript"),
      status = COALESCE($3::text, 'COMPLETED'),
      "completedAt" = CASE WHEN COALESCE($3::text, 'COMPLETED') = 'COMPLETED' THEN NOW() ELSE "completedAt" END,
      "updatedAt" = NOW()
    WHERE "applicationId" = $4
    `,
    recordingUrl || null,
    transcript || null,
    finalStatus,
    applicationId
  );
}


export async function POST(req: Request) {
  try {
    const body = await req.json();

    const result = interviewFinalizeSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { applicationId, recordingUrl, transcript, interviewStatus, appStatus, duration } = result.data;
    
    const transcriptRaw = transcript;
    const finalTranscript = transcriptRaw?.trim();
    const finalDuration = typeof duration === 'number' ? duration : (duration ? parseInt(String(duration)) : null);

    console.log(`[FINALIZE] ${applicationId} | status=${interviewStatus} | duration=${finalDuration}s`);

    await persistInterviewUpdateRaw({ applicationId, recordingUrl, transcript: finalTranscript, interviewStatus });

    if (finalDuration !== null && !isNaN(finalDuration)) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Interview" SET "interviewDuration" = $1, "updatedAt" = NOW() WHERE "applicationId" = $2`,
        finalDuration,
        applicationId
      );
    }

    if (appStatus) {
      await prisma.$executeRawUnsafe(
        'UPDATE "Application" SET status = $1, "updatedAt" = NOW() WHERE id = $2',
        appStatus,
        applicationId
      );
    }

    let jobId: string | number | undefined;
    try {
      const job = await interviewFinalizationQueue.add(
        "finalize-interview",
        { applicationId, recordingUrl, transcript: finalTranscript, interviewStatus, appStatus },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        }
      );
      jobId = job.id;
    } catch (e) {
      console.warn("[INTERVIEW FINALIZE] Queue unavailable, persisted synchronously", e);
    }

    return NextResponse.json({ success: true, persisted: true, queued: !!jobId, jobId });
  } catch (error) {
    console.error("[INTERVIEW FINALIZE QUEUE ERROR]", error);
    return NextResponse.json({ error: "Failed to finalize interview" }, { status: 500 });
  }
}
