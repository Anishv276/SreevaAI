import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { interviewFinalizationQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { interviewFinalizeSchema } from "@/lib/validation";
import crypto from "crypto";
import { generateId } from "@/lib/ids";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { generateInterviewReport } from "@/lib/interview-analysis";
import {
  deductInterviewQuota,
  incrementOrgCreditsUsed,
} from "@/lib/credits";
import { recordOrgBillingUsage } from "@/lib/usage-metrics";
import { safeJsonParse } from "@/lib/utils";

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

async function persistInterviewReportRaw(params: {
  applicationId: string;
  interviewReport: unknown;
  aiSummary?: string | null;
}) {
  const { applicationId, interviewReport, aiSummary } = params;
  await prisma.$executeRawUnsafe(
    `
    UPDATE "Interview"
    SET "interviewReport" = $1::jsonb,
        "aiSummary" = COALESCE($2::text, "Interview"."aiSummary"),
        "updatedAt" = NOW()
    WHERE "applicationId" = $3
    `,
    JSON.stringify(interviewReport),
    aiSummary || null,
    applicationId
  );
}

async function persistStrategicVerdictRaw(params: {
  applicationId: string;
  strategicVerdict: unknown;
}) {
  const { applicationId, strategicVerdict } = params;
  await prisma.$executeRawUnsafe(
    `
    UPDATE "Interview"
    SET "strategicVerdict" = $1::jsonb,
        "updatedAt" = NOW()
    WHERE "applicationId" = $2
    `,
    JSON.stringify(strategicVerdict),
    applicationId
  );
}

function estimateInterviewReportUsage(params: {
  transcript: string;
  resumeText: string;
  jdText: string;
  report: unknown;
  durationSeconds: number;
}) {
  const promptText = [
    params.transcript,
    params.resumeText,
    params.jdText,
    "Interview report generation",
    String(params.durationSeconds || 0),
  ]
    .filter(Boolean)
    .join("\n\n");

  const reportText = JSON.stringify(params.report ?? {});
  return {
    model: "gpt-4o",
    inputTokens: Math.max(1, Math.ceil(promptText.length / 4)),
    outputTokens: Math.max(1, Math.ceil(reportText.length / 4)),
    cachedInputTokens: 0,
  };
}

type InterviewReportShape = {
  qa_blocks?: Array<{
    q?: number;
    title?: string;
    tags?: string[];
    score?: string;
    scoreColor?: string;
    verdict?: string;
    confidence?: string;
  }>;
  recording?: {
    summary?: string;
  };
  verdict?: {
    summary?: string;
    recommendation?: string;
    recommendation_reason?: string;
  };
  strategic_verdict?: unknown;
};

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

    try {
      // Re-fetch AFTER saves so we get the latest transcript (agent.py may have already saved it)
      const app = await prisma.application.findUnique({
        where: { id: applicationId },
        select: {
          fullName: true,
          resumeText: true,
          aiReport: true,
          drive: {
            select: {
              id: true,
              title: true,
              orgId: true,
            },
          },
          interview: {
            select: {
              proctoringEvents: true,
              interviewDuration: true,
              interviewTranscript: true,
              interviewReport: true,
            },
          },
        },
      });

      if (app) {
        const driveRows = await prisma.$queryRawUnsafe<Array<{ extractedDetails: string | null }>>(
          `
          SELECT "extractedDetails"
          FROM "Drive"
          WHERE id = $1
          LIMIT 1
          `,
          app.drive?.id
        );

        const resumeText =
          app.resumeText?.trim() ||
          (() => {
            if (!app.aiReport) return "";
            try {
              const parsed = JSON.parse(app.aiReport);
              return String(parsed?.text || parsed?.resume_text || "");
            } catch {
              return "";
            }
          })();

        const structuredResume = {};
        const driveDetails = driveRows?.[0]?.extractedDetails
          ? safeJsonParse(driveRows[0].extractedDetails, {})
          : {};
        const jdText = [
          app.drive?.title || "",
          JSON.stringify(driveDetails || {}),
        ].filter(Boolean).join("\n\n");
        // Use transcript from client first, then DB (agent.py may have saved it already)
        const transcriptForReport = finalTranscript || app.interview?.interviewTranscript || "";
        const durationForReport = resolvedDuration ?? app.interview?.interviewDuration ?? 0;
        const proctoringEvents = Array.isArray(app.interview?.proctoringEvents)
          ? app.interview?.proctoringEvents
          : [];

        // Use existing report from DB if available; otherwise generate new one using GPT-4o
        let report = app.interview?.interviewReport as InterviewReportShape | null;
        let interviewReportUsage:
          | {
              model?: string | null;
              inputTokens?: number;
              outputTokens?: number;
              cachedInputTokens?: number;
              sessionDuration?: number;
            }
          | null = null;
        if (!report && transcriptForReport) {
          const { data: generatedReport, usage: reportUsage } = await generateInterviewReport({
            transcript: transcriptForReport,
            resumeText,
            jdText,
            role: app.drive?.title || "Interview Role",
            candidateName: app.fullName,
            durationSeconds: durationForReport,
            proctoringEvents,
            orgId: app.drive?.orgId || undefined,
          });
          report = generatedReport;
          interviewReportUsage = reportUsage || estimateInterviewReportUsage({
            transcript: transcriptForReport,
            resumeText,
            jdText,
            report,
            durationSeconds: durationForReport,
          });

          await persistInterviewReportRaw({
            applicationId,
            interviewReport: report,
            aiSummary: report?.recording?.summary || report?.verdict?.summary || null,
          });
        } else if (report) {
          interviewReportUsage = estimateInterviewReportUsage({
            transcript: transcriptForReport,
            resumeText,
            jdText,
            report,
            durationSeconds: durationForReport,
          });
        }

        if (app.drive?.orgId && interviewReportUsage) {
          await recordOrgBillingUsage({
            orgId: app.drive.orgId,
            feature: "interviewReport",
            usage: interviewReportUsage,
          }).catch(console.error);
        }
        await persistStrategicVerdictRaw({
          applicationId,
          strategicVerdict: report?.strategic_verdict || {
            decision:
              report?.verdict?.recommendation === "Strong Yes" || report?.verdict?.recommendation === "Yes"
                ? "Hire"
                : report?.verdict?.recommendation === "No"
                  ? "Do Not Hire"
                  : "Maybe",
            summary: report?.verdict?.summary || "",
            rationale: report?.verdict?.recommendation_reason ? [report.verdict.recommendation_reason] : [],
            next_actions: [],
          },
        });
      }
    } catch (reportError) {
      console.error("[INTERVIEW FINALIZE] Failed to generate interview report", reportError);
    }

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
