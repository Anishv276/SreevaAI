import { NextResponse } from "next/server";
import { interviewFinalizationQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { interviewFinalizeSchema } from "@/lib/validation";
import crypto from "crypto";
import { generateId } from "@/lib/ids";

export const runtime = "nodejs";

async function persistInterviewUpdateRaw(params: {
  applicationId: string;
  recordingUrl?: string;
  transcript?: string;
  interviewStatus?: string;
}) {
  const { applicationId, recordingUrl, transcript, interviewStatus } = params;
  const finalStatus = interviewStatus || "COMPLETED";

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { fullName: true }
  });
  const interviewId = generateId("int", app?.fullName || applicationId);
  const accessToken = crypto.randomUUID();

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "Interview" (id, "applicationId", "accessToken", status, "interviewRecordingUrl", "interviewRecordedAt", "interviewTranscript", "completedAt", "createdAt", "updatedAt")
    VALUES ($1, $2, $3, COALESCE($4::text, 'COMPLETED'), $5, CASE WHEN $5::text IS NOT NULL THEN NOW() ELSE NULL END, $6, CASE WHEN COALESCE($4::text, 'COMPLETED') = 'COMPLETED' THEN NOW() ELSE NULL END, NOW(), NOW())
    ON CONFLICT ("applicationId")
    DO UPDATE SET
      status = COALESCE($4::text, 'COMPLETED'),
      "interviewRecordingUrl" = COALESCE($5::text, "Interview"."interviewRecordingUrl"),
      "interviewRecordedAt" = CASE WHEN $5::text IS NOT NULL THEN NOW() ELSE "Interview"."interviewRecordedAt" END,
      "interviewTranscript" = COALESCE($6::text, "Interview"."interviewTranscript"),
      "completedAt" = CASE WHEN COALESCE($4::text, 'COMPLETED') = 'COMPLETED' THEN NOW() ELSE "Interview"."completedAt" END,
      "updatedAt" = NOW()
    `,
    interviewId,
    applicationId,
    accessToken,
    finalStatus,
    recordingUrl || null,
    transcript || null
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

    const { applicationId, interviewToken, recordingUrl, transcript, interviewStatus, appStatus, duration } = result.data;

    // ── AUTHENTICATION ────────────────────────────────
    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      select: { accessToken: true }
    });
    if (!interview || interview.accessToken !== interviewToken) {
      return NextResponse.json({ error: "Unauthorized: Invalid finalization token" }, { status: 401 });
    }
    
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

    const finalAppStatus = appStatus || "COMPLETED";
    await prisma.$executeRawUnsafe(
      'UPDATE "Application" SET status = $1, "updatedAt" = NOW() WHERE id = $2',
      finalAppStatus,
      applicationId
    );

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
