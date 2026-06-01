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
import { recordOrgBillingUsage } from "@/lib/usage-metrics";
import { getOrgRecordingSettings, scheduleRecordingRetentionDeletion } from "@/lib/recording-retention";

export const runtime = "nodejs";

function roundCredits(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

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
      billing,
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
    const transcriptRaw = transcript;
    const finalTranscript = transcriptRaw?.trim();
    const interviewTurns = finalTranscript ? buildInterviewTurns(finalTranscript) : [];
    const finalDuration = typeof duration === 'number' ? duration : (duration ? parseInt(String(duration)) : null);
    let recordingUrlForPersist = recordingUrl;
    let recordingSettingsForOrg: { recordingEnabled: boolean; recordingRetentionDays: number } | null = null;
    try {
      const appForRecordingPolicy = await prisma.application.findUnique({
        where: { id: applicationId },
        select: {
          drive: {
            select: {
              orgId: true,
            },
          },
        },
      });
      const recordingOrgId = appForRecordingPolicy?.drive?.orgId || "";
      if (recordingOrgId) {
        recordingSettingsForOrg = await getOrgRecordingSettings(recordingOrgId);
        if (!recordingSettingsForOrg.recordingEnabled) {
          recordingUrlForPersist = undefined;
        }
      }
    } catch (policyError) {
      console.warn("[RETENTION] Failed to resolve recording policy for finalize route:", policyError);
    }

    console.log(`[FINALIZE] ${applicationId} | status=${finalInterviewStatus} | duration=${finalDuration}s`);

    await persistInterviewUpdateRaw({
      applicationId,
      recordingUrl: recordingUrlForPersist,
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
          select: {
            fullName: true,
            drive: { select: { orgId: true, role: true, title: true } }
          }
        });
        const orgId = appForOrg?.drive?.orgId;

        if (recordingUrlForPersist && orgId) {
          const recordingSettings = recordingSettingsForOrg || await getOrgRecordingSettings(orgId);
          if (recordingSettings.recordingEnabled) {
            await scheduleRecordingRetentionDeletion({
              applicationId,
              completedAt: recordingCompletedAt || new Date(),
              retentionDays: recordingSettings.recordingRetentionDays,
              recordingUrl: recordingUrlForPersist,
            }).catch((error) => {
              console.warn(`[RETENTION] Failed to schedule cleanup for ${applicationId}:`, error);
            });
          }
        }

        if (orgId) {
          const interviewForBilling = await prisma.interview.findUnique({
            where: { applicationId },
            select: { billingSnapshot: true },
          });
          const existingSnapshot =
            interviewForBilling?.billingSnapshot && typeof interviewForBilling.billingSnapshot === "object"
              ? (interviewForBilling.billingSnapshot as Record<string, unknown>)
              : {};
          const durationSec = Math.max(0, Number(resolvedDuration ?? 0));
          const creditsUsed = roundCredits(durationSec / 60);
          const llmModel = String(billing?.llmModel ?? existingSnapshot.llmModel ?? "unknown").trim();
          const ttsModel = String(billing?.ttsModel ?? existingSnapshot.ttsModel ?? "unknown").trim();
          const sttModel = String(billing?.sttModel ?? existingSnapshot.sttModel ?? "unknown").trim();
          const inputTokens = Math.max(0, Number(billing?.inputTokens ?? existingSnapshot.inputTokens ?? 0));
          const outputTokens = Math.max(0, Number(billing?.outputTokens ?? existingSnapshot.outputTokens ?? 0));
          const cachedInputTokens = Math.max(0, Number(billing?.cachedInputTokens ?? existingSnapshot.cachedInputTokens ?? 0));
          const llmCostUsd = Math.max(0, Number(billing?.llmCostUsd ?? existingSnapshot.llmCostUsd ?? 0));
          const ttsCharacters = Math.max(0, Number(billing?.ttsCharacters ?? existingSnapshot.ttsCharacters ?? 0));
          const ttsCostUsd = Math.max(0, Number(billing?.ttsCostUsd ?? existingSnapshot.ttsCostUsd ?? 0));
          const sttAudioSeconds = Math.max(0, Number(billing?.sttAudioSeconds ?? existingSnapshot.sttAudioSeconds ?? 0));
          const sttCostUsd = Math.max(0, Number(billing?.sttCostUsd ?? existingSnapshot.sttCostUsd ?? 0));
          const hasExactCostBreakdown =
            existingSnapshot.llmCostUsd !== undefined ||
            existingSnapshot.ttsCostUsd !== undefined ||
            existingSnapshot.sttCostUsd !== undefined ||
            billing?.llmCostUsd !== undefined ||
            billing?.ttsCostUsd !== undefined ||
            billing?.sttCostUsd !== undefined;
          const totalCostUsd = Math.max(
            0,
            Number(
              billing?.totalCostUsd
                ?? existingSnapshot.totalCostUsd
                ?? (llmCostUsd + ttsCostUsd + sttCostUsd)
            )
          );
          const billingSnapshotPayload = {
            ...existingSnapshot,
            durationSec,
            creditsUsed,
            interviewName: `${appForOrg?.fullName || "Unknown Candidate"} - ${appForOrg?.drive?.title || appForOrg?.drive?.role || "Interview"}`,
            candidateName: appForOrg?.fullName || "Unknown Candidate",
            jobTitle: appForOrg?.drive?.role || appForOrg?.drive?.title || "Unknown Role",
            llmModel,
            ttsModel,
            sttModel,
            inputTokens,
            outputTokens,
            cachedInputTokens,
            ttsCharacters,
            sttAudioSeconds,
            llmCostUsd,
            ttsCostUsd,
            sttCostUsd,
            totalCostUsd,
            costSource: hasExactCostBreakdown ? "exact" : "missing",
            billedAt: Math.floor(Date.now() / 1000),
          };
          // Atomically mark the interview as billed — returns the row only if not already billed.
          const marked = await prisma.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
              UPDATE "Interview"
              SET "billingSnapshot" = ${JSON.stringify(billingSnapshotPayload)}::jsonb,
              "updatedAt" = NOW()
              WHERE "applicationId" = ${applicationId}
                AND ("billingSnapshot" IS NULL OR "billingSnapshot"->'billedAt' IS NULL)
              RETURNING id
            `
          );
          if (marked.length > 0) {
            // This is the first and only time we bill for this interview.
            await deductInterviewQuota(orgId, 1);
            const dur = durationSec;
            if (Number.isFinite(dur) && dur > 0) {
              const creditsDelta = roundCredits(dur / 60);
              if (creditsDelta > 0) {
                await incrementOrgCreditsUsed(orgId, creditsDelta);
              }
            }
            // Record interview runtime usage once per completed interview.
            await recordOrgBillingUsage({
              orgId,
              feature: "interview",
              usage: {
                model: llmModel,
                inputTokens,
                outputTokens,
                cachedInputTokens,
                sessionDuration: Number.isFinite(dur) ? dur : 0,
                costUsd: llmCostUsd,
                ttsRuns: ttsCharacters > 0 ? 1 : 0,
                ttsCharacters,
                ttsCostUsd,
                sttRuns: sttAudioSeconds > 0 ? 1 : 0,
                sttAudioSeconds,
                sttCostUsd,
              },
            }).catch((usageError) => {
              console.error("[FINALIZE] Interview usage recording failed:", usageError);
            });
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
        { applicationId, recordingUrl: recordingUrlForPersist, transcript: finalTranscript, interviewStatus: finalInterviewStatus, appStatus },
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
