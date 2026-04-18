import { NextResponse } from "next/server";
import { interviewFinalizationQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { interviewFinalizeSchema } from "@/lib/validation";
import crypto from "crypto";
import { generateId } from "@/lib/ids";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { generateInterviewReport } from "@/lib/interview-analysis";

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

    const { applicationId, interviewToken, recordingUrl, transcript, interviewStatus, appStatus, duration } = result.data;
    const requireInterviewToken = isInterviewTokenRequired();

    // ── AUTHENTICATION ────────────────────────────────
    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      select: { accessToken: true }
    });
    if (requireInterviewToken && (!interview || interview.accessToken !== interviewToken)) {
      return NextResponse.json({ error: "Unauthorized: Invalid finalization token" }, { status: 401 });
    }
    
    const transcriptRaw = transcript;
    const finalTranscript = transcriptRaw?.trim();
    const finalDuration = typeof duration === 'number' ? duration : (duration ? parseInt(String(duration)) : null);

    console.log(`[FINALIZE] ${applicationId} | status=${interviewStatus} | duration=${finalDuration}s`);

    await persistInterviewUpdateRaw({ applicationId, recordingUrl, transcript: finalTranscript, interviewStatus });

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

    try {
      // Re-fetch AFTER saves so we get the latest transcript (agent.py may have already saved it)
      const app = await prisma.application.findUnique({
        where: { id: applicationId },
        select: {
          fullName: true,
          resumeText: true,
          structuredResume: true,
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

        const structuredResume = app.structuredResume
          ? (typeof app.structuredResume === "string" ? JSON.parse(app.structuredResume) : app.structuredResume)
          : {};
        const driveDetails = app.drive?.extractedDetails
          ? (typeof app.drive.extractedDetails === "string" ? JSON.parse(app.drive.extractedDetails) : app.drive.extractedDetails)
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

        if (transcriptForReport) {
          const report = await generateInterviewReport({
            transcript: transcriptForReport,
            resumeText,
            jdText,
            role: app.drive?.title || "Interview Role",
            candidateName: app.fullName,
            durationSeconds: durationForReport,
            proctoringEvents,
            orgId: app.drive?.orgId || undefined,
          });

          await persistInterviewReportRaw({
            applicationId,
            interviewReport: report,
            aiSummary: report.recording?.summary || report.verdict?.summary || null,
          });
          await persistStrategicVerdictRaw({
            applicationId,
            strategicVerdict: report.strategic_verdict || {
              decision:
                report.verdict?.recommendation === "Strong Yes" || report.verdict?.recommendation === "Yes"
                  ? "Hire"
                  : report.verdict?.recommendation === "No"
                    ? "Do Not Hire"
                    : "Maybe",
              summary: report.verdict?.summary || "",
              rationale: report.verdict?.recommendation_reason ? [report.verdict.recommendation_reason] : [],
              next_actions: [],
            },
          });
        }
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
