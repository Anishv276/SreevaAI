import { NextResponse } from "next/server";
import { interviewFinalizationQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { interviewFinalizeSchema } from "@/lib/validation";
import crypto from "crypto";
import { generateId } from "@/lib/ids";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { deductInterviewQuotaForApplication } from "@/lib/usage-metrics";
import { getOrgRecordingSettings, scheduleRecordingRetentionDeletion } from "@/lib/recording-retention";
import { mergeRecordingState, type RecordingState } from "@/lib/recording-state";
export const runtime = "nodejs";
async function persistInterviewUpdateRaw(params: {
  applicationId: string;
  recordingUrl?: string;
  transcript?: string;
  interviewStatus?: string;
  snapshots?: string[];
  recordingCompletedAt?: Date;
  recordingDurationSec?: number;
}) {
  const { 
    applicationId,
    recordingUrl,
    transcript,
    interviewStatus,
    snapshots,
    recordingCompletedAt,
    recordingDurationSec 
  } = params;
  const finalStatus = interviewStatus || "IN_PROGRESS";
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { fullName: true, drive: { select: { title: true, role: true } } }
  });
  const existingInterview = await prisma.interview.findUnique({
    where: { applicationId },
    select: { recording: true },
  }).catch(() => null);
  const interviewId = generateId("int", app?.fullName || applicationId);
  const accessToken = crypto.randomUUID();
  const completedAtIso = recordingCompletedAt?.toISOString() || null;
  const recordingPatch: RecordingState = recordingUrl ? {
    name: [app?.fullName, app?.drive?.title || app?.drive?.role].filter(Boolean).join(" - ") || applicationId,
    status: finalStatus === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
    url: recordingUrl,
    recordedAt: completedAtIso || new Date().toISOString(),
    completedAt: completedAtIso,
    durationSec: recordingDurationSec || null,
  } : {};
  const nextRecording = mergeRecordingState(existingInterview?.recording, recordingPatch);
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "Interview" (id, "applicationId", "accessToken", status, "interviewTranscript", "snapshots", "recording", "completedAt", "createdAt", "updatedAt")
    VALUES ($1, $2, $3, COALESCE($4::text, 'IN_PROGRESS'), $6, $7, COALESCE($8::jsonb, '{}'::jsonb), CASE WHEN COALESCE($4::text, 'IN_PROGRESS') = 'COMPLETED' THEN NOW() ELSE NULL END, NOW(), NOW())
    ON CONFLICT ("applicationId")
    DO UPDATE SET
      status = COALESCE($4::text, "Interview".status),
      "interviewTranscript" = COALESCE($6::text, "Interview"."interviewTranscript"),
      "snapshots" = COALESCE($7, "Interview"."snapshots"),
      "recording" = CASE WHEN $5::text IS NOT NULL THEN $8::jsonb ELSE "Interview"."recording" END,
      "completedAt" = CASE WHEN COALESCE($4::text, "Interview".status) = 'COMPLETED' THEN NOW() ELSE "Interview"."completedAt" END,
      "updatedAt" = NOW()
    `,
    interviewId,
    applicationId,
    accessToken,
    finalStatus,
    recordingUrl || null,
    transcript || null,
    snapshots || [],
    JSON.stringify(nextRecording)
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
      select: { accessToken: true, completedAt: true, interviewDuration: true, startedAt: true }
    });
    if (requireInterviewToken && (!interview || interview.accessToken !== interviewToken)) {
      return NextResponse.json({ error: "Unauthorized: Invalid finalization token" }, { status: 401 });
    }
    const transcriptRaw = transcript;
    const finalTranscript = transcriptRaw?.trim();
    // ponytail: the agent runtime (agent_persistence.update_interview_status) is the
    // authoritative writer of interviewDuration -- it already applies the
    // time_expired -> full time_limit cap and real-elapsed otherwise. Client-sent
    // `duration` is untrusted (can be stale/inflated) and must never overwrite an
    // already-persisted interviewDuration. Only used as a last-resort fallback when
    // the agent hasn't written one yet (e.g. legacy/non-agent finalize callers).
    const clientDuration = typeof duration === 'number' ? duration : (duration ? parseInt(String(duration)) : null);
    const finalDuration = interview?.interviewDuration != null
      ? interview.interviewDuration
      : (clientDuration ?? (interview?.startedAt ? Math.round((Date.now() - new Date(interview.startedAt).getTime()) / 1000) : null));
    let recordingUrlForPersist = recordingUrl;
    let recordingSettingsForOrg: { recordingEnabled: boolean; recordingRetentionDays: number | null } | null = null;
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
      recordingSettingsForOrg = { recordingEnabled: false, recordingRetentionDays: null };
      recordingUrlForPersist = undefined;
    }
    console.log(`[FINALIZE] ${applicationId} | status=${finalInterviewStatus} | duration=${finalDuration}s`);
    await persistInterviewUpdateRaw({
      applicationId,
      recordingUrl: recordingUrlForPersist,
      transcript: finalTranscript,
      interviewStatus: finalInterviewStatus,
      snapshots,
      recordingCompletedAt,
      recordingDurationSec: finalDuration ?? recordingDurationSec,
    });
    if (recordingSettingsForOrg && !recordingSettingsForOrg.recordingEnabled) {
      await prisma.$executeRawUnsafe(
        `
        UPDATE "Interview"
        SET
          "recording" = jsonb_set(COALESCE("recording", '{}'::jsonb), '{status}', '"DISABLED"'::jsonb, true),
          "updatedAt" = NOW()
        WHERE "applicationId" = $1
        `,
        applicationId
      ).catch(() => {});
    }
    const interviewAfterPersist = await prisma.interview.findUnique({
      where: { applicationId },
      select: { completedAt: true },
    });
    // Only write if the agent hasn't already persisted the authoritative value --
    // never overwrite an existing interviewDuration with the client-sent one.
    if (interview?.interviewDuration == null && finalDuration !== null && !isNaN(finalDuration as number)) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Interview" SET "interviewDuration" = $1, "updatedAt" = NOW() WHERE "applicationId" = $2`,
        finalDuration,
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
          if (recordingSettings.recordingEnabled && recordingSettings.recordingRetentionDays !== null) {
            await scheduleRecordingRetentionDeletion({
              applicationId,
              completedAt: interviewAfterPersist?.completedAt || recordingCompletedAt || new Date(),
              retentionDays: recordingSettings.recordingRetentionDays,
              recordingUrl: recordingUrlForPersist,
            }).catch((error) => {
              console.warn(`[RETENTION] Failed to schedule cleanup for ${applicationId}:`, error);
            });
          } else if (recordingSettings.recordingEnabled) {
            console.warn(
              `[RETENTION] Recording is enabled for ${applicationId}, but no retention days are configured.`
            );
          }
        }
        if (orgId) {
          await deductInterviewQuotaForApplication({
            applicationId,
            durationSeconds: Number.isFinite(Number(finalDuration)) ? Number(finalDuration) : null,
          });
          console.log(`[FINALIZE] Billing finalized for ${applicationId} org=${orgId} dur=${finalDuration}s`);
        }
      } catch (creditError) {
        console.error("[FINALIZE] Billing deduction failed:", creditError);
      }
    }
    // Report generation is handled by the interview-finalization worker via Redis.
    // No synchronous LLM call here -- the candidate is not blocked and no timeout occurs.
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
