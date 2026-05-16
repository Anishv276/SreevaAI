import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { interviewFinalizationQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { interviewFinalizeSchema } from "@/lib/validation";
import crypto from "crypto";
import { generateId } from "@/lib/ids";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import {
  deductInterviewQuota,
  incrementOrgCreditsUsed,
} from "@/lib/credits";

export const runtime = "nodejs";

function buildInterviewTurns(transcript: string): Array<{
  turn: number;
  question: string;
  answer: string;
  questionSpeaker: "Interviewer";
  answerSpeaker: "Candidate" | null;
}> {
  const lines = (transcript || "").split(/\r?\n/);
  const blocks: Array<{ speaker: "Interviewer" | "Candidate"; text: string }> = [];

  const pushBlock = (speaker: "Interviewer" | "Candidate", text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    const last = blocks[blocks.length - 1];
    if (last && last.speaker === speaker) {
      last.text = `${last.text} ${cleaned}`.trim();
      return;
    }
    blocks.push({ speaker, text: cleaned });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.toLowerCase().startsWith("interviewer:")) {
      pushBlock("Interviewer", line.slice("Interviewer:".length));
    } else if (line.toLowerCase().startsWith("candidate:")) {
      pushBlock("Candidate", line.slice("Candidate:".length));
    } else {
      pushBlock("Interviewer", line);
    }
  }

  const turns: Array<{
    turn: number;
    question: string;
    answer: string;
    questionSpeaker: "Interviewer";
    answerSpeaker: "Candidate" | null;
  }> = [];
  let currentQuestion = "";
  let currentAnswerParts: string[] = [];
  let turnIndex = 0;

  const flush = () => {
    const question = currentQuestion.trim();
    const answer = currentAnswerParts.join(" ").trim();
    if (!question && !answer) return;
    turnIndex += 1;
    turns.push({
      turn: turnIndex,
      question,
      answer,
      questionSpeaker: "Interviewer",
      answerSpeaker: answer ? "Candidate" : null,
    });
    currentQuestion = "";
    currentAnswerParts = [];
  };

  for (const block of blocks) {
    if (block.speaker === "Interviewer") {
      if (currentQuestion || currentAnswerParts.length) flush();
      currentQuestion = block.text;
    } else {
      if (!currentQuestion) currentQuestion = "";
      currentAnswerParts.push(block.text);
    }
  }

  if (currentQuestion || currentAnswerParts.length) flush();
  return turns;
}


async function persistInterviewUpdateRaw(params: {
  applicationId: string;
  recordingUrl?: string;
  transcript?: string;
  interviewStatus?: string;
  interviewTurns?: unknown;
  snapshots?: string[];
  recordingCompletedAt?: Date;
  recordingDurationSec?: number;
}) {
  const { 
    applicationId, 
    recordingUrl, 
    transcript, 
    interviewStatus, 
    interviewTurns,
    snapshots,
    recordingCompletedAt,
    recordingDurationSec 
  } = params;
  const finalStatus = interviewStatus || "IN_PROGRESS";

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { fullName: true }
  });
  const interviewId = generateId("int", app?.fullName || applicationId);
  const accessToken = crypto.randomUUID();

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "Interview" (id, "applicationId", "accessToken", status, "interviewRecordingUrl", "interviewRecordedAt", "interviewTranscript", "interviewTurns", "snapshots", "recordingCompletedAt", "recordingDurationSec", "completedAt", "createdAt", "updatedAt")
    VALUES ($1, $2, $3, COALESCE($4::text, 'IN_PROGRESS'), $5, CASE WHEN $5::text IS NOT NULL THEN NOW() ELSE NULL END, $6, COALESCE($7::jsonb, '[]'::jsonb), $8, $9, $10, CASE WHEN COALESCE($4::text, 'IN_PROGRESS') = 'COMPLETED' THEN NOW() ELSE NULL END, NOW(), NOW())
    ON CONFLICT ("applicationId")
    DO UPDATE SET
      status = COALESCE($4::text, "Interview".status),
      "interviewRecordingUrl" = COALESCE($5::text, "Interview"."interviewRecordingUrl"),
      "interviewRecordedAt" = CASE WHEN $5::text IS NOT NULL THEN NOW() ELSE "Interview"."interviewRecordedAt" END,
      "interviewTranscript" = COALESCE($6::text, "Interview"."interviewTranscript"),
      "interviewTurns" = COALESCE($7::jsonb, "Interview"."interviewTurns"),
      "snapshots" = COALESCE($8, "Interview"."snapshots"),
      "recordingCompletedAt" = COALESCE($9, "Interview"."recordingCompletedAt"),
      "recordingDurationSec" = COALESCE($10, "Interview"."recordingDurationSec"),
      "completedAt" = CASE WHEN COALESCE($4::text, "Interview".status) = 'COMPLETED' THEN NOW() ELSE "Interview"."completedAt" END,
      "updatedAt" = NOW()
    `,
    interviewId,
    applicationId,
    accessToken,
    finalStatus,
    recordingUrl || null,
    transcript || null,
    JSON.stringify(interviewTurns ?? []),
    snapshots || [],
    recordingCompletedAt || null,
    recordingDurationSec || null
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

    const {
      applicationId,
      interviewToken,
      recordingUrl,
      transcript,
      interviewStatus,
      status,
      appStatus,
      duration,
      snapshots,
      recordingCompletedAt,
      recordingDurationSec
    } = result.data;
    const finalInterviewStatus = interviewStatus || status || "IN_PROGRESS";
    const requireInterviewToken = isInterviewTokenRequired();

    // -- AUTHENTICATION --------------------------------
    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      select: { accessToken: true, completedAt: true }
    });
    if (requireInterviewToken && (!interview || interview.accessToken !== interviewToken)) {
      return NextResponse.json({ error: "Unauthorized: Invalid finalization token" }, { status: 401 });
    }
    const isNewCompletion = finalInterviewStatus === "COMPLETED" && !interview?.completedAt;

    const transcriptRaw = transcript;
    const finalTranscript = transcriptRaw?.trim();
    const interviewTurns = finalTranscript ? buildInterviewTurns(finalTranscript) : [];
    const finalDuration = typeof duration === 'number' ? duration : (duration ? parseInt(String(duration)) : null);

    console.log(`[FINALIZE] ${applicationId} | status=${finalInterviewStatus} | duration=${finalDuration}s`);

    await persistInterviewUpdateRaw({
      applicationId,
      recordingUrl,
      transcript: finalTranscript,
      interviewStatus: finalInterviewStatus,
      interviewTurns,
      snapshots,
      recordingCompletedAt,
      recordingDurationSec: finalDuration ?? recordingDurationSec,
    });

    // Duration: use client-sent value, else compute from startedAt
    let resolvedDuration = finalDuration;
    if ((resolvedDuration === null || isNaN(resolvedDuration as number))) {
      const startedAtRows = await prisma.$queryRaw<Array<{ startedAt: Date | null }>>`
        SELECT "startedAt" FROM "Interview" WHERE "applicationId" = ${applicationId} LIMIT 1
      `;
      const startedAt = startedAtRows?.[0]?.startedAt;
      if (startedAt) {
        resolvedDuration = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
      }
    }
    if (resolvedDuration !== null && !isNaN(resolvedDuration as number)) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Interview" SET "interviewDuration" = $1, "updatedAt" = NOW() WHERE "applicationId" = $2`,
        resolvedDuration,
        applicationId
      );
    }

    const finalAppStatus = appStatus || "COMPLETED";
    await prisma.$executeRawUnsafe(
      'UPDATE "Application" SET "interviewStatus" = $1, "updatedAt" = NOW() WHERE id = $2',
      finalAppStatus,
      applicationId
    );

    // Deduct one interview quota and record minute-based credit usage.
    // Uses an atomic "mark-and-deduct" to prevent double-billing regardless of
    // whether the agent already set completedAt before this endpoint was called.
    // Only fires if billingSnapshot->billedAt is not yet set on this Interview row.
    if (finalInterviewStatus === "COMPLETED") {
      try {
        const appForOrg = await prisma.application.findUnique({
          where: { id: applicationId },
          select: { drive: { select: { orgId: true } } }
        });
        const orgId = appForOrg?.drive?.orgId;
        if (orgId) {
          // Atomically mark the interview as billed — returns the row only if not already billed.
          const marked = await prisma.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
              UPDATE "Interview"
              SET "billingSnapshot" = jsonb_set(
                COALESCE("billingSnapshot", '{}'::jsonb),
                '{billedAt}',
                to_jsonb(extract(epoch from now())::bigint)
              ),
              "updatedAt" = NOW()
              WHERE "applicationId" = ${applicationId}
                AND ("billingSnapshot" IS NULL OR "billingSnapshot"->'billedAt' IS NULL)
              RETURNING id
            `
          );
          if (marked.length > 0) {
            // This is the first and only time we bill for this interview.
            await deductInterviewQuota(orgId, 1);
            const dur = resolvedDuration ?? 0;
            if (Number.isFinite(dur) && dur > 0) {
              const creditsDelta = Math.round((dur / 60) * 100) / 100;
              if (creditsDelta > 0) {
                await incrementOrgCreditsUsed(orgId, creditsDelta);
              }
            }
            console.log(`[FINALIZE] Billing deducted for ${applicationId} org=${orgId} dur=${resolvedDuration}s`);
          } else {
            console.log(`[FINALIZE] Billing already deducted for ${applicationId} — skipping`);
          }
        }
      } catch (creditError) {
        console.error("[FINALIZE] Billing deduction failed:", creditError);
      }
    }

    // Report generation is handled by the interview-finalization worker via Redis.
    // No synchronous LLM call here — the candidate is not blocked and no timeout occurs.

  let jobId: string | number | undefined;
  try {
      const job = await interviewFinalizationQueue.add(
        "finalize-interview",
        { applicationId, recordingUrl, transcript: finalTranscript, interviewStatus: finalInterviewStatus, appStatus },
        {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
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
