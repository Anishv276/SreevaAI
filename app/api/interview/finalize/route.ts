import { NextResponse } from "next/server";
import { interviewFinalizationQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { interviewFinalizeSchema } from "@/lib/validation";
import crypto from "crypto";
import { generateId } from "@/lib/ids";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { generateInterviewReport } from "@/lib/interview-analysis";
import {
  deductInterviewQuota,
  getInterviewQuotaUnits,
  incrementOrgCreditsUsed,
} from "@/lib/credits";
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

function normalizeReportTurns(interviewTurns: Array<{
  turn?: number;
  question?: string;
  answer?: string;
}>) {
  return interviewTurns
    .map((turn, idx) => {
      const question = String(turn.question || "").trim();
      const answer = String(turn.answer || "").trim();
      const shortAnswer = answer || "Candidate response was not captured clearly.";
      const reasoning = answer
        ? "Transcript captured for this answer; analytical reasoning was not generated."
        : "Candidate response was not captured clearly.";
      const lowConfidence = answer.length < 40 ? "Confidence: Low -- brief answer" : "Confidence: Medium -- transcript-backed";
      const score = !answer
        ? "--"
        : /i don't know|i do not know|not sure|no idea|not good at/i.test(answer)
          ? "0/10"
          : answer.length < 25
            ? "1/10"
            : answer.length < 80
              ? "3/10"
              : "5/10";

      return {
        q: Number(turn.turn || idx + 1),
        question: question || `Question ${idx + 1}`,
        answer: shortAnswer,
        reasoning,
        score,
        confidence: lowConfidence,
      };
    })
    .filter((row) => row.question || row.reasoning || row.answer);
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
  const finalStatus = interviewStatus || "COMPLETED";

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { fullName: true }
  });
  const interviewId = generateId("int", app?.fullName || applicationId);
  const accessToken = crypto.randomUUID();

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "Interview" (id, "applicationId", "accessToken", status, "interviewRecordingUrl", "interviewRecordedAt", "interviewTranscript", "interviewTurns", "snapshots", "recordingCompletedAt", "recordingDurationSec", "completedAt", "createdAt", "updatedAt")
    VALUES ($1, $2, $3, COALESCE($4::text, 'COMPLETED'), $5, CASE WHEN $5::text IS NOT NULL THEN NOW() ELSE NULL END, $6, COALESCE($7::jsonb, '[]'::jsonb), $8, $9, $10, CASE WHEN COALESCE($4::text, 'COMPLETED') = 'COMPLETED' THEN NOW() ELSE NULL END, NOW(), NOW())
    ON CONFLICT ("applicationId")
    DO UPDATE SET
      status = COALESCE($4::text, 'COMPLETED'),
      "interviewRecordingUrl" = COALESCE($5::text, "Interview"."interviewRecordingUrl"),
      "interviewRecordedAt" = CASE WHEN $5::text IS NOT NULL THEN NOW() ELSE "Interview"."interviewRecordedAt" END,
      "interviewTranscript" = COALESCE($6::text, "Interview"."interviewTranscript"),
      "interviewTurns" = COALESCE($7::jsonb, "Interview"."interviewTurns"),
      "snapshots" = COALESCE($8, "Interview"."snapshots"),
      "recordingCompletedAt" = COALESCE($9, "Interview"."recordingCompletedAt"),
      "recordingDurationSec" = COALESCE($10, "Interview"."recordingDurationSec"),
      "completedAt" = CASE WHEN COALESCE($4::text, 'COMPLETED') = 'COMPLETED' THEN NOW() ELSE "Interview"."completedAt" END,
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
      appStatus, 
      duration,
      snapshots,
      recordingCompletedAt,
      recordingDurationSec
    } = result.data;
    const requireInterviewToken = isInterviewTokenRequired();

    // -- AUTHENTICATION --------------------------------
    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      select: { accessToken: true, completedAt: true }
    });
    if (requireInterviewToken && (!interview || interview.accessToken !== interviewToken)) {
      return NextResponse.json({ error: "Unauthorized: Invalid finalization token" }, { status: 401 });
    }
    const isNewCompletion = !interview?.completedAt;

    const transcriptRaw = transcript;
    const finalTranscript = transcriptRaw?.trim();
    const interviewTurns = finalTranscript ? buildInterviewTurns(finalTranscript) : [];
    const finalDuration = typeof duration === 'number' ? duration : (duration ? parseInt(String(duration)) : null);

    console.log(`[FINALIZE] ${applicationId} | status=${interviewStatus} | duration=${finalDuration}s`);

    await persistInterviewUpdateRaw({
      applicationId,
      recordingUrl,
      transcript: finalTranscript,
      interviewStatus,
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

    // Deduct one interview only when the session crosses the 5-minute quota threshold.
    try {
      const appForOrg = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { drive: { select: { orgId: true } } }
      });
      const orgId = appForOrg?.drive?.orgId;
      if (orgId) {
        const quotaUnits = resolvedDuration !== null && !isNaN(resolvedDuration as number)
          ? getInterviewQuotaUnits(resolvedDuration)
          : 0;
        if (quotaUnits > 0) {
          await deductInterviewQuota(orgId, quotaUnits);
        }
        if (isNewCompletion && resolvedDuration !== null && !isNaN(resolvedDuration as number)) {
          const creditsDelta = Math.round(((resolvedDuration || 0) / 60) * 100) / 100;
          if (creditsDelta > 0) {
            await incrementOrgCreditsUsed(orgId, creditsDelta);
          }
        }
      }
    } catch (creditError) {
      console.error("[FINALIZE] Billing deduction failed:", creditError);
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
              title: true,
              description: true,
              requirements: true,
              skills: true,
              extractedDetails: true,
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
        const driveDetails = app.drive?.extractedDetails
          ? safeJsonParse(app.drive.extractedDetails, {})
          : {};
        const jdText = [
          app.drive?.title || "",
          app.drive?.description || "",
          app.drive?.requirements || "",
          app.drive?.skills || "",
          JSON.stringify(driveDetails || {}),
        ].filter(Boolean).join("\n\n");
        // Use transcript from client first, then DB (agent.py may have saved it already)
        const transcriptForReport = finalTranscript || app.interview?.interviewTranscript || "";
        const durationForReport = resolvedDuration ?? app.interview?.interviewDuration ?? 0;
        const proctoringEvents = Array.isArray(app.interview?.proctoringEvents)
          ? app.interview?.proctoringEvents
          : [];

        // Use existing report from DB if available; otherwise generate new one using GPT-4o
        let report = app.interview?.interviewReport as any;
        if (!report && transcriptForReport) {
          report = await generateInterviewReport({
            transcript: transcriptForReport,
            resumeText,
            jdText,
            role: app.drive?.title || "Interview Role",
            candidateName: app.fullName,
            durationSeconds: durationForReport,
            proctoringEvents,
            orgId: app.drive?.orgId || undefined,
          });

          const turnRows = normalizeReportTurns(interviewTurns.length > 0 ? interviewTurns : buildInterviewTurns(transcriptForReport));
          if (!Array.isArray(report?.qa_blocks) || report.qa_blocks.length === 0) {
            report.qa_blocks = turnRows.map((row) => ({
              q: row.q,
              title: row.question,
              tags: ["Transcript", "Interview"],
              score: row.score,
              scoreColor: row.score === "--" ? "text-gray-300" : "text-orange-500",
              verdict: row.reasoning,
              confidence: row.confidence,
            }));
          }

          await persistInterviewReportRaw({
            applicationId,
            interviewReport: report,
            aiSummary: report?.recording?.summary || report?.verdict?.summary || null,
          });
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
      { applicationId, recordingUrl, transcript: finalTranscript, interviewStatus, appStatus },
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
