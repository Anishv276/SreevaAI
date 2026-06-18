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
import { getOrgRecordingSettings, scheduleRecordingRetentionDeletion } from "@/lib/recording-retention";
import { mergeRecordingState, type RecordingState } from "@/lib/recording-state";
export const runtime = "nodejs";
function roundCredits(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}
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
  const existingInterview = await (prisma as any).interview.findUnique({
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
      select: { accessToken: true, completedAt: true }
    });
    if (requireInterviewToken && (!interview || interview.accessToken !== interviewToken)) {
      return NextResponse.json({ error: "Unauthorized: Invalid finalization token" }, { status: 401 });
    }
    const transcriptRaw = transcript;
    const finalTranscript = transcriptRaw?.trim();
    const finalDuration = typeof duration === 'number' ? duration : (duration ? parseInt(String(duration)) : null);
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
          const billingSnapshotPayload = {
            ...existingSnapshot,
            durationSec,
            creditsUsed,
            interviewName: `${appForOrg?.fullName || "Unknown Candidate"} - ${appForOrg?.drive?.title || appForOrg?.drive?.role || "Interview"}`,
            candidateName: appForOrg?.fullName || "Unknown Candidate",
            jobTitle: appForOrg?.drive?.role || appForOrg?.drive?.title || "Unknown Role",
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
