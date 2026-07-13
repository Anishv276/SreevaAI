import 'dotenv/config'; // must be FIRST — ensures .env is loaded before any lib reads process.env
import { Worker, Queue } from 'bullmq';
import crypto from 'crypto';
import { prisma } from './lib/prisma';
import redisConnection, { createRedisConnection, getBullPrefix } from './lib/redis';
import { putObject, getObjectBuffer, headObjectStrict, deleteObjectStrict, getKeyFromUrl } from "./lib/s3";
import { generateId } from "./lib/ids";
import { isInterviewTokenRequired } from "./lib/interview-access";
import { appendCandidateActivity } from "./lib/candidate-activity";
import { recordOrgBillingUsage } from "./lib/usage-metrics";
import { Prisma } from "@prisma/client";
import { recordingRetentionQueue, invitationDeliveryQueue } from "./lib/queue";
import { JD_EXTRACTION_QUEUE_NAME } from "./lib/jd-extraction";
import {
  computeRecordingRetentionDueAt,
  deleteRecordingAsset,
  extractRecordingKey,
  getOrgRecordingSettings,
  RECORDING_RETENTION_SWEEP_JOB,
  scheduleRecordingRetentionDeletion,
} from "./lib/recording-retention";
import { mergeRecordingState, normalizeRecordingState, parseJsonRecord } from "./lib/recording-state";
import { logRedisError, logResumeUploadError, logJobError, logWorkerError, logLiveKitError } from "./lib/slack-error-logger";
import { runWithOrgSlot } from "./lib/org-concurrency";
import {
  processResumeScreeningViaModal,
  processResumeFileExtractViaModal,
  processJdExtractionViaModal,
  processBriefGenerationViaModal,
  processInterviewReportViaModal,
} from "./lib/modal-dispatch";

// Per-org concurrency caps -- how many jobs of a given queue may run
// simultaneously FOR THE SAME ORG, independent of the worker's own global
// `concurrency`. See lib/org-concurrency.ts for why (BullMQ OSS has no native
// per-key/group concurrency; that's a BullMQ Pro-only feature). Override via
// env if a specific org/queue needs more headroom.
// NOTE: resumeProcessing/jdExtraction/briefGeneration/interviewReport are no
// longer used here -- those 4 job types moved fully to Modal (see
// lib/modal-concurrency.ts's MODAL_ORG_CONCURRENCY for their caps). Kept only
// for invitationDelivery, which still runs on this BullMQ worker.
const ORG_CONCURRENCY = {
  invitationDelivery: Number(process.env.ORG_CONCURRENCY_INVITATION || 2),
};

if (!process.env.REDIS_URL) {
  console.error('FATAL: REDIS_URL is missing from environment variables!');
  process.exit(1);
}

// Global safety net: anything that escapes every try/catch in the worker
// (a bug in a queue processor, an unawaited rejected promise) still reaches
// Slack instead of just crashing the process silently in prod.
process.on('uncaughtException', (err) => {
  console.error('[Worker] uncaughtException:', err);
  void logWorkerError({ error: err, reason: 'Uncaught exception in worker process' });
});
process.on('unhandledRejection', (reason) => {
  console.error('[Worker] unhandledRejection:', reason);
  void logWorkerError({
    error: reason instanceof Error ? reason : String(reason),
    reason: 'Unhandled promise rejection in worker process',
  });
});

// Removed manual .connect() call because ioredis connects automatically (lazyConnect: false).
// Calling it manually causes "Redis is already connecting/connected" errors.
// BullMQ key prefix -- MUST match lib/queue.ts so this worker consumes the same
// queues the API enqueues to. Set BULLMQ_PREFIX to isolate dev/prod on shared Redis.
const BULL_PREFIX = getBullPrefix();
console.log(`[Worker] PID=${process.pid}`);
console.log(`[Worker] BullMQ prefix="${BULL_PREFIX}"`);

async function processInterviewStartJob(job: any) {
  const {
    applicationId,
    startedAt: startedAtRaw,
    accessToken,
  } = job.data || {};
  if (!applicationId) {
    throw new Error("Missing applicationId in interview-start job");
  }
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true },
  });
  if (!application) {
    console.warn(`[INTERVIEW-START] Application ${applicationId} no longer exists. Skipping.`);
    return { skipped: true, reason: "missing_application" };
  }
  const startedAtCandidate = startedAtRaw ? new Date(String(startedAtRaw)) : new Date();
  if (!Number.isFinite(startedAtCandidate.getTime())) {
    throw new Error(`Invalid startedAt timestamp for ${applicationId}`);
  }
  const existingInterview = await prisma.interview.findUnique({
    where: { applicationId },
    select: {
      interviewStartedAt: true,
      interviewStatus: true,
      candidateInviteToken: true,
    },
  });
  if (existingInterview?.interviewStartedAt) {
    console.log(
      `[INTERVIEW-START] Interview already started for ${applicationId} at ${existingInterview.interviewStartedAt.toISOString()}`
    );
    await prisma.application.update({
      where: { id: applicationId },
      data: { interviewPhaseStatus: "IN_PROGRESS" },
    }).catch(() => { });
    return {
      success: true,
      alreadyStarted: true,
      applicationId,
      startedAt: existingInterview.interviewStartedAt.toISOString(),
    };
  }
  const interviewAccessToken = existingInterview?.candidateInviteToken || accessToken || crypto.randomUUID();
  await prisma.interview.upsert({
    where: { applicationId },
    update: {
      interviewStatus: "LAUNCHING",
      interviewStartedAt: startedAtCandidate,
    },
    create: {
      id: generateId("int", applicationId),
      applicationId,
      candidateInviteToken: interviewAccessToken,
      interviewStatus: "LAUNCHING",
      interviewStartedAt: startedAtCandidate,
    },
  });
  await prisma.application.update({
    where: { id: applicationId },
    data: { interviewPhaseStatus: "IN_PROGRESS" },
  });
  console.log(
    `[INTERVIEW-START] Persisted start time for ${applicationId} at ${startedAtCandidate.toISOString()}`
  );
  return {
    success: true,
    applicationId,
    startedAt: startedAtCandidate.toISOString(),
    interviewStatus: "LAUNCHING",
  };
}
async function processRecordingRetentionSweepJob(job: any) {
  const rows = await prisma.$queryRaw<Array<{
    applicationId: string;
    sessionRecording: unknown;
  }>>(
    Prisma.sql`
      SELECT
        i."applicationId",
        i."sessionRecording"
      FROM "Interview" i
      JOIN "Application" a ON a.id = i."applicationId"
      JOIN "Job" d ON d.id = a."jobId"
      JOIN "OrganizationDetails" o ON o.id = d."organizationId"
      WHERE COALESCE(
          NULLIF(i."sessionRecording"->>'url', ''),
          NULLIF(i."sessionRecording"->'manifest'->>'recordingUrl', '')
        ) IS NOT NULL
        AND COALESCE(i."sessionRecording"->'retention'->>'deletedAt', '') = ''
        AND (
          (NULLIF(i."sessionRecording"->'retention'->>'dueAt', '')::timestamp IS NOT NULL
            AND NULLIF(i."sessionRecording"->'retention'->>'dueAt', '')::timestamp <= NOW())
          OR (
            NULLIF(i."sessionRecording"->'retention'->>'dueAt', '') IS NULL
            AND COALESCE(
              NULLIF(i."sessionRecording"->>'completedAt', '')::timestamp,
              NULLIF(i."sessionRecording"->>'recordedAt', '')::timestamp,
              CASE
                WHEN NULLIF(i."sessionRecording"->>'startedAt', '') IS NOT NULL
                  AND NULLIF(i."sessionRecording"->>'durationSec', '') IS NOT NULL
                THEN NULLIF(i."sessionRecording"->>'startedAt', '')::timestamp
                  + (NULLIF(i."sessionRecording"->>'durationSec', '')::integer * INTERVAL '1 second')
                ELSE NULL
              END,
              NULLIF(i."sessionRecording"->'manifest'->>'startedAt', '')::timestamp,
              i."interviewCompletedAt"
            ) + (
              GREATEST(COALESCE(NULLIF(i."sessionRecording"->'retention'->>'days', '')::integer, o."recordingKeepForDays"), 1) * INTERVAL '1 day'
            ) <= NOW()
          )
        )
      ORDER BY COALESCE(
        NULLIF(i."sessionRecording"->'retention'->>'dueAt', '')::timestamp,
        NULLIF(i."sessionRecording"->>'completedAt', '')::timestamp,
        NULLIF(i."sessionRecording"->>'recordedAt', '')::timestamp,
        CASE
          WHEN NULLIF(i."sessionRecording"->>'startedAt', '') IS NOT NULL
            AND NULLIF(i."sessionRecording"->>'durationSec', '') IS NOT NULL
          THEN NULLIF(i."sessionRecording"->>'startedAt', '')::timestamp
            + (NULLIF(i."sessionRecording"->>'durationSec', '')::integer * INTERVAL '1 second')
          ELSE NULL
        END,
        NULLIF(i."sessionRecording"->'manifest'->>'startedAt', '')::timestamp,
        i."interviewCompletedAt",
        i."interviewUpdatedAt"
      ) ASC
      LIMIT 100
    `
  );
  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    const recordingState = normalizeRecordingState(row.sessionRecording);
    const attempt = Math.max(1, Number(recordingState.retention?.cleanupAttempts || 0) + 1);
    const manifestRecord = parseJsonRecord(recordingState.manifest);
    const recordingUrl = String(recordingState.url || manifestRecord.recordingUrl || "").trim() || null;
    const recordingManifest = recordingState.manifest;
    const recordingKey = extractRecordingKey({
      recordingUrl,
      recordingManifest,
      recording: row.sessionRecording,
    });
    await prisma.interview.update({
      where: { applicationId: row.applicationId },
      data: {
        sessionRecording: mergeRecordingState(row.sessionRecording, {
          retention: {
            cleanupStatus: "PROCESSING",
            cleanupAttempts: attempt,
            cleanupLastError: null,
          },
        }),
      },
    }).catch(() => { });
    const deleteResult = await deleteRecordingAsset({
      recordingUrl,
      recordingKey,
      recordingManifest,
      recording: row.sessionRecording,
      bucket: process.env.R2_INTERVIEW_BUCKET || "interview",
      attempts: 2,
      baseDelayMs: 1000,
    });
    if (!deleteResult.success) {
      const lastError = deleteResult.lastError || "Failed to delete recording asset from Cloudflare R2";
      failed += 1;
      await prisma.interview.update({
        where: { applicationId: row.applicationId },
        data: {
          sessionRecording: mergeRecordingState(row.sessionRecording, {
            retention: {
              cleanupStatus: "FAILED",
              cleanupAttempts: attempt,
              cleanupLastError: lastError,
            },
          }),
        },
      }).catch(() => { });
      console.error(`[RETENTION] Sweep failed to delete recording for ${row.applicationId}: ${lastError}`);
      continue;
    }
    const deletedAt = new Date();
    deleted += 1;
    await prisma.interview.update({
      where: { applicationId: row.applicationId },
      data: {
        sessionRecording: mergeRecordingState(row.sessionRecording, {
          status: "DELETED",
          url: null,
          key: recordingKey || deleteResult.key || null,
          manifest: {
            ...manifestRecord,
            recordingUrl: null,
            lastStatus: "DELETED",
          },
          retention: {
            cleanupStatus: "COMPLETED",
            cleanupAttempts: attempt,
            cleanupLastError: null,
            deletedAt: deletedAt.toISOString(),
          },
        }),
      },
    });
  }
  if (deleted > 0 || failed > 0) {
    console.log(`[RETENTION] Sweep deleted ${deleted} expired recording(s), failed ${failed}.`);
  }
  return {
    success: true,
    deleted,
    failed,
  };
}

/**
 * Proctoring snapshots have no per-item retention metadata (unlike recordings,
 * which track dueAt/cleanupStatus in sessionRecording.retention) -- they're just
 * a plain URL array on Interview.proctoringSnapshotUrls. Reuses the SAME
 * org.recordingKeepForDays window as recordings so there's one retention knob
 * to manage, not two. An org with no recording retention configured keeps its
 * snapshots forever, same as recordings do today.
 */
async function processSnapshotRetentionSweepJob(job: any) {
  const rows = await prisma.$queryRaw<Array<{
    applicationId: string;
    proctoringSnapshotUrls: string[];
  }>>(
    Prisma.sql`
      SELECT
        i."applicationId",
        i."proctoringSnapshotUrls"
      FROM "Interview" i
      JOIN "Application" a ON a.id = i."applicationId"
      JOIN "Job" d ON d.id = a."jobId"
      JOIN "OrganizationDetails" o ON o.id = d."organizationId"
      WHERE array_length(i."proctoringSnapshotUrls", 1) > 0
        AND o."recordingKeepForDays" IS NOT NULL
        AND i."interviewCompletedAt" IS NOT NULL
        AND i."interviewCompletedAt" + (GREATEST(o."recordingKeepForDays", 1) * INTERVAL '1 day') <= NOW()
      ORDER BY i."interviewCompletedAt" ASC
      LIMIT 100
    `
  );
  let deleted = 0;
  let failed = 0;
  const bucket = process.env.R2_INTERVIEW_BUCKET || "interview";
  for (const row of rows) {
    const urls = row.proctoringSnapshotUrls || [];
    let allDeleted = true;
    for (const url of urls) {
      const key = getKeyFromUrl(url);
      if (!key) continue;
      try {
        await deleteObjectStrict(bucket, key);
      } catch (error: any) {
        const code = String(error?.name || error?.Code || "").toLowerCase();
        if (!code.includes("nosuchkey") && !code.includes("notfound")) {
          allDeleted = false;
          console.error(`[SNAPSHOT-RETENTION] Failed to delete ${key} for ${row.applicationId}: ${error?.message}`);
        }
      }
    }
    if (!allDeleted) {
      failed += 1;
      continue;
    }
    await prisma.interview.update({
      where: { applicationId: row.applicationId },
      data: { proctoringSnapshotUrls: [] },
    }).catch(() => {});
    deleted += 1;
  }
  if (deleted > 0 || failed > 0) {
    console.log(`[SNAPSHOT-RETENTION] Sweep cleared snapshots for ${deleted} interview(s), failed ${failed}.`);
  }
  return { success: true, deleted, failed };
}

async function persistInterviewUpdateRaw(params: {
  applicationId: string;
  recordingUrl?: string;
  transcript?: string;
  interviewStatus?: string;
}) {
  const { applicationId, recordingUrl, transcript, interviewStatus } = params;
  const now = new Date();
  const fallbackId = generateId("int", "fallback");
  const existingInterview = await prisma.interview.findUnique({
    where: { applicationId },
    select: { fullTranscript: true, sessionRecording: true },
  });
  const existingTranscript = String(existingInterview?.fullTranscript || "").trim();
  const incomingTranscript = String(transcript || "").trim();
  const transcriptToPersist = incomingTranscript && incomingTranscript.length >= existingTranscript.length
    ? incomingTranscript
    : existingTranscript;
  const recordingToPersist = recordingUrl
    ? mergeRecordingState(existingInterview?.sessionRecording, {
      status: interviewStatus === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
      url: recordingUrl,
      recordedAt: now.toISOString(),
    })
    : null;
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "Interview" ("id", "applicationId", "candidateInviteToken", "interviewStatus", "fullTranscript", "sessionRecording", "interviewCompletedAt", "interviewCreatedAt", "interviewUpdatedAt")
    VALUES ($6::text, $1::text, $7::text, COALESCE($2::text, 'PROGRESS'), $4::text, COALESCE($8::jsonb, '{}'::jsonb), CASE WHEN $2::text = 'COMPLETED' THEN $5::timestamp ELSE NULL END, $5::timestamp, $5::timestamp)
    ON CONFLICT ("applicationId")
    DO UPDATE SET
      "interviewStatus" = COALESCE($2::text, "Interview"."interviewStatus"),
      "candidateInviteToken" = COALESCE("Interview"."candidateInviteToken", EXCLUDED."candidateInviteToken"),
      "fullTranscript" = COALESCE($4::text, "Interview"."fullTranscript"),
      "sessionRecording" = CASE WHEN $3::text IS NOT NULL THEN $8::jsonb ELSE "Interview"."sessionRecording" END,
      "interviewCompletedAt" = CASE WHEN $2::text = 'COMPLETED' THEN $5::timestamp ELSE "Interview"."interviewCompletedAt" END,
      "interviewUpdatedAt" = $5::timestamp
    `,
    applicationId,
    interviewStatus || null,
    recordingUrl || null,
    transcriptToPersist || null,
    now,
    fallbackId,
    crypto.randomUUID(),
    recordingToPersist ? JSON.stringify(recordingToPersist) : null
  );
}
const managedWorkers: Worker[] = [];

let shutdownInProgress = false;
let setupRetentionCronJobs: (() => Promise<void>) | null = null;
const requestedQueues = new Set(
  (process.env.WORKER_QUEUES || "resume-processing")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
);
console.log("[Worker] Enabled queues:", Array.from(requestedQueues).join(", "));
function isQueueEnabled(queueName: string) {
  return requestedQueues.has("all") || requestedQueues.has(queueName);
}
function trackWorker(name: string, worker: Worker) {
  managedWorkers.push(worker);
  worker.on("error", (error) => {
    console.error(`[${name}] Redis/BullMQ error:`, error);
    logRedisError({
      error: error instanceof Error ? error.message : String(error),
      reason: `BullMQ worker connection error on queue "${name}"`,
      context: { queueName: name },
    });
  });
  // Log when jobs are cleared (60s after completion/failure as per queue config)
  worker.on("completed", (_job) => { /* removed immediately, no log needed */ });
  worker.on("failed", (_job, _err) => { /* logged at point of failure */ });
  return worker;
}
async function closeWorkerResources(reason: string) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  console.log(`[Worker] Shutting down (${reason}) and closing Redis resources...`);
  await Promise.allSettled(managedWorkers.map(async (worker) => {
    try {
      await worker.close();
    } catch (error) {
      console.warn(`[Worker] Failed to close worker cleanly:`, error);
    }
  }));

  await redisConnection.quit().catch(() => {
    try {
      redisConnection.disconnect();
    } catch {
      // Ignore disconnect failures during shutdown.
    }
  });
  await prisma.$disconnect().catch(() => { });
  console.log("[Worker] Shutdown complete.");
}
process.once("SIGINT", () => {
  void closeWorkerResources("SIGINT");
});
process.once("SIGTERM", () => {
  void closeWorkerResources("SIGTERM");
});
async function getRedisMemoryStatus() {
  try {
    const info = await redisConnection.info("memory");
    const usedMemoryMatch = info.match(/used_memory:(\d+)/);
    const maxMemoryMatch = info.match(/maxmemory:(\d+)/);
    const usedMemory = usedMemoryMatch ? Number(usedMemoryMatch[1]) : null;
    const maxMemory = maxMemoryMatch ? Number(maxMemoryMatch[1]) : null;
    return { usedMemory, maxMemory };
  } catch (error) {
    console.warn("[Worker] Could not read Redis memory info:", (error as Error).message);
    return { usedMemory: null, maxMemory: null };
  }
}
function formatBytes(bytes: number | null) {
  if (bytes == null || Number.isNaN(bytes)) return "unknown";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
async function shouldSkipCronRegistration() {
  const { usedMemory, maxMemory } = await getRedisMemoryStatus();
  if (!usedMemory || !maxMemory) {
    return false;
  }
  if (maxMemory <= 0) {
    return false;
  }
  const usageRatio = usedMemory / maxMemory;
  if (usageRatio >= 0.9) {
    console.warn(
      `[Worker] Redis is at ${Math.round(usageRatio * 100)}% capacity ` +
      `(${formatBytes(usedMemory)} / ${formatBytes(maxMemory)}). ` +
      "Skipping repeatable job registration to avoid BullMQ OOM errors."
    );
    return true;
  }
  return false;
}

// -----------------------------------------------------------------------------
// RESUME PROCESSING WORKER
// Single worker, two job types:
//   "screen-resume"      -- full pipeline: extract + score + write DB (from upload routes)
//   "resume-file-extract"— extract only, result returned for UI polling (/api/extract)
// Workers continuously poll the queue; as soon as a slot opens the next job starts.
// -----------------------------------------------------------------------------
if (isQueueEnabled("resume-processing")) {
  const resumeWorker = trackWorker("resume-processing", new Worker("resume-processing", async (job, token) => {
    console.log(`\n=================================================`);
    console.log(`▶ [RESUME WORKER] PID=${process.pid} Job: name="${job.name}" id="${job.id}"`);
    console.log(`=================================================\n`);

    // Both job types run on Modal now (see lib/modal-dispatch.ts) -- per-org
    // concurrency gating happens inside via lib/modal-concurrency.ts, not
    // runWithOrgSlot (that was the BullMQ-OSS workaround this replaces).
    if (job.name === "screen-resume") {
      return processResumeScreeningViaModal(job, token);
    }
    if (job.name === "resume-file-extract") {
      return processResumeFileExtractViaModal(job, token);
    }
    throw new Error(`[RESUME-WORKER] Unknown job name: "${job.name}"`);
  }, {
    connection: createRedisConnection(),
    prefix: BULL_PREFIX,
    concurrency: 70, // global cap -- Modal handles ~100 concurrent jobs; per-org cap (MODAL_ORG_CONCURRENCY.resumeExtraction) does the real per-org limiting
    lockDuration: 15 * 60 * 1000,
    stalledInterval: 60 * 1000,
    maxStalledCount: 2,
    drainDelay: 300,
    removeOnComplete: { age: 60 },
    removeOnFail:    { age: 60 },
  }));

  resumeWorker.on("error", (err) => {
    console.error(`[resume-processing] Worker error:`, err.message);
  });
  resumeWorker.on("active", (job) => {
    console.log(`[resume-processing] ► Active: name="${job.name}" id="${job.id}" app="${job.data?.applicationId}"`);
  });
  resumeWorker.on("completed", (job, result) => {
    console.log(`[resume-processing] ✓ Completed: name="${job.name}" id="${job.id}" result=${JSON.stringify(result)}`);
  });
  resumeWorker.on("failed", (job, err) => {
    console.error(`[resume-processing] ✗ Failed: name="${job?.name}" id="${job?.id}" — ${err.message}`);
    console.error(err.stack);
    const applicationId = job?.data?.applicationId as string | undefined;
    if (applicationId) {
      prisma.application.findUnique({
        where: { id: applicationId },
        select: { candidateFullName: true, job: { select: { title: true, organization: { select: { name: true } } } } },
      }).then((app) => {
        logResumeUploadError({
          orgName: app?.job?.organization?.name || "unknown",
          jobName: app?.job?.title || "unknown",
          candidateName: app?.candidateFullName || undefined,
          error: err.message,
          reason: `Resume screening worker job failed (name="${job?.name}")`,
        });
      }).catch(() => {
        logResumeUploadError({
          orgName: "unknown",
          jobName: "unknown",
          error: err.message,
          reason: `Resume screening worker job failed — applicationId=${applicationId} (org/job lookup failed)`,
        });
      });
    } else {
      logWorkerError({
        error: err.message,
        reason: "Resume screening worker job failed with no applicationId in job data",
        context: { jobId: job?.id, jobName: job?.name },
      });
    }
  });
  resumeWorker.on("stalled", (jobId) => {
    console.warn(`[resume-processing] ⚠ Stalled: id="${jobId}"`);
  });

  void resumeWorker.waitUntilReady()
    .then(async () => {
      console.log(`[resume-processing] Worker ready. Queue="resume-processing" | Dispatches to Modal (per-org cap enforced in lib/modal-concurrency.ts)`);
      // DUPLICATE-WORKER GUARD: if another consumer is already subscribed to this
      // queue (e.g. a stale Docker container on the prod host), it will race us for
      // jobs and our console will silently miss them. Surface it loudly.
      try {
        const guardQueue = new Queue("resume-processing", { connection: redisConnection, prefix: BULL_PREFIX });
        const all = await guardQueue.getWorkers();
        await guardQueue.close();
        if (all.length > 1) {
          console.warn(
            `[resume-processing] ⚠ DUPLICATE CONSUMERS DETECTED (${all.length}) on this queue. ` +
            `Other workers will steal jobs. Addresses: ` +
            all.map((w: any) => `${w.addr}(age=${w.age}s)`).join(", ")
          );
        }
      } catch { /* getWorkers best-effort */ }
    })
    .catch((err) => console.error("[resume-processing] Worker failed to become ready:", err));

  // STALE-ROW RECONCILER: the durable guarantee that no candidate hangs on
  // "waiting"/"processing" forever. A row can become orphaned if the enqueue
  // failed silently, the job was stolen+lost by a duplicate worker, or Redis
  // evicted the job hash. Every 2 minutes we cross-check DB rows against live
  // BullMQ jobs; any row older than the grace window with NO backing job is
  // marked "failed" so the UI stops spinning. Also purges orphan failed-set
  // pointers (failed-set members whose job hash is already gone).
  void reconcileResumeQueue();
  setInterval(() => { void reconcileResumeQueue(); }, 2 * 60 * 1000).unref();
}

async function reconcileResumeQueue() {
  const GRACE_MS = 10 * 60 * 1000; // give a real job up to 10 min before declaring it dead
  try {
    const reconcileQueue = new Queue("resume-processing", { connection: redisConnection, prefix: BULL_PREFIX });
    // 1) Purge orphan failed-set pointers (job hash already removed by removeOnFail age).
    await reconcileQueue.clean(0, 1000, "failed").catch(() => []);

    // 2) Gather the applicationIds that DO have a live job (waiting/active/delayed).
    const liveJobs = await reconcileQueue.getJobs(["waiting", "active", "delayed", "paused"], 0, 5000, false);
    const liveAppIds = new Set(
      liveJobs.filter(Boolean).map((j: any) => String(j?.data?.applicationId || "")).filter(Boolean)
    );
    await reconcileQueue.close();

    // 3) Find DB rows stuck in an in-flight status past the grace window.
    const cutoff = new Date(Date.now() - GRACE_MS);
    const stuck = await prisma.application.findMany({
      where: {
        resumeScreeningStatus: { in: ["waiting", "processing", "extracting", "scoring", "starting"] },
        applicationUpdatedAt: { lt: cutoff },
      },
      select: { id: true, resumeScreeningStatus: true },
    });

    const orphaned = stuck.filter((row) => !liveAppIds.has(row.id));
    if (orphaned.length === 0) return;

    for (const row of orphaned) {
      await prisma.application.update({
        where: { id: row.id },
        data: {
          resumeScreeningStatus: "failed",
          resumeAiReport: JSON.stringify({ processing: { progress: 0, stage: "failed", error: "No active screening job (reconciled)" } }),
          applicationUpdatedAt: new Date(),
        },
      }).catch(() => {});
    }
    console.warn(`[RECONCILE] Marked ${orphaned.length} orphaned resume row(s) as failed (no backing job): ${orphaned.map((o) => o.id).join(", ")}`);
  } catch (err: any) {
    console.warn(`[RECONCILE] Reconciler sweep failed: ${err?.message}`);
  }
}
if (isQueueEnabled("invitation-delivery-queue")) {
  const invitationDeliveryWorker = trackWorker("invitation-delivery-queue", new Worker(
    "invitation-delivery-queue",
    async (job, token) => {
      const {
        applicationId,
        action,
      }: {
        applicationId?: string;
        action?: "shortlist" | "reject";
      } = job.data || {};
      console.log(`\n=================================================`);
      console.log(`▶ [INVITATION WORKER] Triggered! Action: ${action} for Candidate: ${applicationId}`);
      console.log(`=================================================\n`);
      if (!applicationId || !action) {
        throw new Error("Missing applicationId or action in invitation-delivery-queue job");
      }
      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: {
          id: true,
          candidateEmail: true,
          candidateFullName: true,
          resumeAiScore: true,
          job: {
            select: {
              id: true,
              title: true,
              organizationId: true,
              organization: {
                select: {
                  name: true,
                },
              },
              applicationDeadline: true,
            },
          },
        },
      });
      if (!application) {
        console.warn(`[Invitation Worker] Application ${applicationId} no longer exists. Skipping.`);
        return { skipped: true, reason: "missing_application" };
      }
      if (!application.candidateEmail) {
        console.warn(`[Invitation Worker] Application ${applicationId} has no email address. Skipping.`);
        return { skipped: true, reason: "missing_email" };
      }

      const orgId = application.job?.organizationId;
      return runWithOrgSlot("invitation-delivery-queue", job, token, orgId, ORG_CONCURRENCY.invitationDelivery, async () => {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sreevaai.com';
        const now = new Date();
        let scheduleLink: string | undefined;
        if (action === "shortlist") {
          const jobDeadline = application.job?.applicationDeadline ? new Date(application.job.applicationDeadline) : null;
          const interviewRecord = await prisma.interview.upsert({
            where: { applicationId },
            update: {
              inviteEmailSentAt: now,
              interviewStatus: "PENDING",
              interviewScheduledAt: null,
              interviewStartedAt: null,
              interviewCompletedAt: null,
              inviteLinkExpiresAt: jobDeadline,
            },
            create: {
              id: generateId("int", application.candidateFullName || applicationId),
              applicationId,
              candidateInviteToken: crypto.randomUUID(),
              inviteEmailSentAt: now,
              interviewStatus: "PENDING",
              inviteLinkExpiresAt: jobDeadline,
            },
          });
          scheduleLink = `${appUrl}/schedule/${interviewRecord.candidateInviteToken}`;
        }
        const { sendScheduleInviteEmail, sendRejectionEmail } = await import('./lib/mail');
        let mailResult: { success: boolean; error?: string };
        if (action === "shortlist") {
          if (!scheduleLink) throw new Error(`scheduleLink required for action=shortlist`);
          mailResult = await sendScheduleInviteEmail({
            email: application.candidateEmail,
            fullName: application.candidateFullName || "Candidate",
            jobTitle: application.job?.title || "Unknown Role",
            orgName: application.job?.organization?.name || "Sreeva AI",
            scheduleLink,
          });
        } else if (action === "reject") {
          mailResult = await sendRejectionEmail({
            email: application.candidateEmail,
            fullName: application.candidateFullName || "Candidate",
            jobTitle: application.job?.title || "Unknown Role",
            orgName: application.job?.organization?.name || "Sreeva AI",
          });
        } else {
          throw new Error(`Unsupported invitation action: ${action}`);
        }
        if (!mailResult.success) {
          const reason = "error" in mailResult && mailResult.error
            ? mailResult.error
            : "Unknown email delivery error";
          await appendCandidateActivity(applicationId, {
            type: "email_failed",
            label: "Email delivery failed",
            details: reason,
            timestamp: new Date().toISOString(),
            source: "worker",
          });
          throw new Error(reason);
        }
        if (action === "shortlist") {
          await prisma.application.update({
            where: { id: applicationId },
            data: { interviewPhaseStatus: "pending", applicationUpdatedAt: new Date() },
          }).catch(() => { });
        }
        await appendCandidateActivity(applicationId, {
          type: "email_sent",
          label: action === "shortlist" ? "Interview invite sent" : "Rejection email sent",
          details: `Delivered at ${new Date().toISOString()}`,
          timestamp: new Date().toISOString(),
          source: "worker",
        });
        console.log(`[Invitation Worker] Delivered ${action} email for ${applicationId}`);
        return { success: true };
      });
    },
    {
      connection: redisConnection,
      prefix: BULL_PREFIX,
      concurrency: 10,
      limiter: {
        max: 5,
        duration: 1000,
      },
      lockDuration: 5 * 60 * 1000,
      stalledInterval: 5 * 60 * 1000,
      maxStalledCount: 1,
      removeOnComplete: { age: 60 },
      removeOnFail: { age: 60 },
    }
  ));
  invitationDeliveryWorker.on("failed", (job, err) => {
    console.log(`[FATAL] Invitation Delivery Job ${job?.id} failed permanently: ${err.message}`);
    logWorkerError({
      error: err.message,
      reason: `Invitation delivery job failed permanently (action="${job?.data?.action}")`,
      context: { jobId: job?.id, applicationId: job?.data?.applicationId },
    });
  });
  invitationDeliveryWorker.on("active", (job) => {
    console.log(`[invitation-delivery-queue] ▶ Started: id="${job.id}" action="${job.data?.action}" app="${job.data?.applicationId}"`);
  });
  invitationDeliveryWorker.on("completed", (job) => {
    console.log(`[invitation-delivery-queue] ✓ Ended: id="${job.id}" action="${job.data?.action}" app="${job.data?.applicationId}"`);
  });
}
if (isQueueEnabled("recording-retention-cleanup")) {
  const recordingRetentionWorker = trackWorker("recording-retention-cleanup", new Worker(
    "recording-retention-cleanup",
    async (job) => {
      console.log(`\n=================================================`);
      console.log(`▶ [RETENTION WORKER] Triggered! Cron job started...`);
      console.log(`=================================================\n`);
      if (job.name === RECORDING_RETENTION_SWEEP_JOB) {
        const recordingResult = await processRecordingRetentionSweepJob(job);
        const snapshotResult = await processSnapshotRetentionSweepJob(job);
        return { recording: recordingResult, snapshots: snapshotResult };
      }
      console.warn(`[RETENTION] Skipping unsupported job name: ${job.name}`);
      return { skipped: true, reason: "unsupported_job_name" };
    },
    {
      connection: redisConnection,
      prefix: BULL_PREFIX,
      concurrency: 100,
      lockDuration: 5 * 60 * 1000,
      stalledInterval: 2 * 60 * 1000,
      maxStalledCount: 1,
      removeOnComplete: { age: 60 },
      removeOnFail: { age: 60 },
    }
  ));
  recordingRetentionWorker.on("failed", (job, err) => {
    console.error(
      `[FATAL] Recording Retention Job ${job?.id} failed permanently for ${job?.data?.applicationId || job?.name}: ${err.message}`
    );
    logWorkerError({
      error: err.message,
      reason: "Recording retention cleanup job failed permanently",
      context: { jobId: job?.id, applicationId: job?.data?.applicationId },
    });
  });
  recordingRetentionWorker.on("active", (job) => {
    console.log(`[recording-retention-cleanup] ▶ Started: id="${job.id}" name="${job.name}"`);
  });
  recordingRetentionWorker.on("completed", (job) => {
    console.log(`[recording-retention-cleanup] ✓ Ended: id="${job.id}" name="${job.name}"`);
  });
}
/**
 * ðŸ’¾ DATABASE BACKUP WORKER (Phase 5 - Persistent Backups to R2)
 * Runs daily at midnight to export core hiring data.
 */
if (isQueueEnabled("interview-start")) {
  const interviewStartWorker = trackWorker("interview-start", new Worker(
    "interview-start",
    async (job) => {
      console.log(`\n=================================================`);
      console.log(`▶ [INTERVIEW START WORKER] Triggered! Job: ${job.name} (ID: ${job.id})`);
      console.log(`=================================================\n`);
      if (job.name !== "mark-interview-started") {
        console.warn(`[INTERVIEW-START] Skipping unsupported job name: ${job.name}`);
        return { skipped: true, reason: "unsupported_job_name" };
      }
      return await processInterviewStartJob(job);
    },
    {
      connection: redisConnection,
      prefix: BULL_PREFIX,
      concurrency: 100,
      lockDuration: 60 * 1000,
      stalledInterval: 30 * 1000,
      maxStalledCount: 1,
      removeOnComplete: { age: 60 },
      removeOnFail: { age: 60 },
    }
  ));
  interviewStartWorker.on("failed", (job, err) => {
    console.log(`[FATAL] Interview Start Job ${job?.id} failed permanently: ${err.message}`);
    logWorkerError({
      error: err.message,
      reason: "Interview start job failed permanently",
      context: { jobId: job?.id, applicationId: job?.data?.applicationId },
    });
  });
  interviewStartWorker.on("active", (job) => {
    console.log(`[interview-start] ▶ Started: id="${job.id}" app="${job.data?.applicationId}"`);
  });
  interviewStartWorker.on("completed", (job) => {
    console.log(`[interview-start] ✓ Ended: id="${job.id}" app="${job.data?.applicationId}"`);
  });
}

/**
 * AGENT-CONNECT TIMEOUT WORKER
 * Delayed job enqueued the instant an interview enters LAUNCHING (token/route.ts).
 * If the LiveKit agent never actually joins and flips the row to PROGRESS/COMPLETED
 * within the timeout, this fires and marks the interview FAILED so the candidate
 * isn't stuck forever and the row doesn't permanently block retries.
 */
if (isQueueEnabled("interview-launch-timeout")) {
  const launchTimeoutWorker = trackWorker("interview-launch-timeout", new Worker(
    "interview-launch-timeout",
    async (job) => {
      if (job.name !== "check-launch-timeout") {
        return { skipped: true, reason: "unsupported_job_name" };
      }
      const { applicationId } = job.data || {};
      if (!applicationId) throw new Error("Missing applicationId in check-launch-timeout job");
      const result = await prisma.interview.updateMany({
        where: { applicationId, interviewStatus: "LAUNCHING" },
        data: { interviewStatus: "FAILED" },
      });
      if (result.count > 0) {
        console.warn(`[LAUNCH-TIMEOUT] App ${applicationId} never reached PROGRESS -- marked FAILED.`);
        await prisma.application.update({
          where: { id: applicationId },
          data: { interviewPhaseStatus: "FAILED" },
        }).catch(() => { });
        return { failed: true, applicationId };
      }
      return { failed: false, applicationId };
    },
    {
      connection: redisConnection,
      prefix: BULL_PREFIX,
      concurrency: 50,
      lockDuration: 60 * 1000,
      removeOnComplete: { age: 60 },
      removeOnFail: { age: 60 },
    }
  ));
  launchTimeoutWorker.on("failed", (job, err) => {
    console.error(`[FATAL] Launch timeout check ${job?.id} failed: ${err.message}`);
    logWorkerError({
      error: err.message,
      reason: "Interview launch-timeout check failed",
      context: { jobId: job?.id, applicationId: job?.data?.applicationId },
    });
  });
}

if (isQueueEnabled("recording-retention-cleanup")) {
  setupRetentionCronJobs = async function setupRetentionCronJobs() {
    const retentionQueue = recordingRetentionQueue;
    const repeatableRetentionJobs = await retentionQueue.getRepeatableJobs();
    for (const job of repeatableRetentionJobs) {
      await retentionQueue.removeRepeatableByKey(job.key);
    }
    await retentionQueue.add(
      RECORDING_RETENTION_SWEEP_JOB,
      {},
      {
        repeat: {
          pattern: "0 9 * * *",
          tz: "Asia/Kolkata",
        },
      }
    );
    console.log("[Worker] Registered daily 9am recording retention sweep job.");
  };
}
/**
 * INTERVIEW FINALIZATION WORKER
 * Persists recording/transcript/status updates, then generates the AI interview
 * report in the background via Redis -- no timeouts, no blocking the candidate.
 */
if (isQueueEnabled("interview-finalization")) {
  const interviewFinalizationWorker = trackWorker("interview-finalization", new Worker(
    "interview-finalization",
    async (job) => {
      const { applicationId } = job.data || {};
      console.log(`\n=================================================`);
      console.log(`▶ [INTERVIEW FINALIZATION WORKER] Triggered! Candidate: ${applicationId}`);
      console.log(`=================================================\n`);
      if (!applicationId) {
        throw new Error("Missing applicationId in interview-finalization job");
      }
      console.log(`[JOB] Finalizing interview for ${applicationId}`);
      try {
        // -- 1. Persist transcript / recording / status --------------------
        const appForPolicy = await prisma.application.findUnique({
          where: { id: applicationId },
          select: {
            job: {
              select: {
                organizationId: true,
              },
            },
          },
        });
        const policyOrgId = String(appForPolicy?.job?.organizationId || "");
        const recordingSettings = policyOrgId
          ? await getOrgRecordingSettings(policyOrgId)
          : { recordingEnabled: false, recordingRetentionDays: null };
        const shouldStoreRecording = Boolean(job.data?.recordingUrl) && recordingSettings.recordingEnabled;
        const recordingDisabled = Boolean(job.data?.recordingUrl && !recordingSettings.recordingEnabled);
        const recordingUrlToPersist = shouldStoreRecording ? job.data?.recordingUrl : undefined;
        if (job.data?.recordingUrl && !recordingSettings.recordingEnabled) {
          await deleteRecordingAsset({
            recordingUrl: job.data?.recordingUrl,
            bucket: process.env.R2_INTERVIEW_BUCKET || "interview",
            attempts: 3,
            baseDelayMs: 1000,
          }).catch((deleteError) => {
            console.warn(
              `[FINALIZE] Failed to delete disabled recording for ${applicationId}:`,
              deleteError
            );
          });
        }
        const updateData: Record<string, unknown> = { interviewUpdatedAt: new Date() };
        const existingInterview = await prisma.interview.findUnique({
          where: { applicationId },
          select: { fullTranscript: true, sessionRecording: true },
        });
        const existingTranscript = String(existingInterview?.fullTranscript || "").trim();
        const incomingTranscript = String(job.data?.transcript || "").trim();
        if (recordingUrlToPersist) {
          updateData.sessionRecording = mergeRecordingState(existingInterview?.sessionRecording, {
            status: job.data?.interviewStatus === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
            url: recordingUrlToPersist,
            recordedAt: new Date().toISOString(),
          });
        } else if (recordingDisabled) {
          const deletedAt = new Date();
          updateData.sessionRecording = mergeRecordingState(existingInterview?.sessionRecording, {
            status: "DISABLED",
            url: null,
            retention: {
              cleanupStatus: "COMPLETED",
              cleanupAttempts: 1,
              cleanupLastError: null,
              deletedAt: deletedAt.toISOString(),
            },
          });
        }
        if (incomingTranscript && incomingTranscript.length >= existingTranscript.length) {
          updateData.fullTranscript = incomingTranscript;
        } else if (incomingTranscript) {
          console.log(
            `[FINALIZE] Skipping shorter transcript overwrite for ${applicationId} ` +
            `(incoming=${incomingTranscript.length}, existing=${existingTranscript.length})`
          );
        }
        if (job.data?.interviewStatus) {
          updateData.interviewStatus = job.data?.interviewStatus;
        }
        if (job.data?.interviewStatus === "COMPLETED") {
          updateData.interviewCompletedAt = new Date();
        }
        try {
          const appForId = await prisma.application.findUnique({ where: { id: applicationId }, select: { candidateFullName: true } });
          await prisma.interview.upsert({
            where: { applicationId },
            update: updateData,
            create: {
              id: generateId("int", appForId?.candidateFullName || applicationId),
              applicationId,
              candidateInviteToken: crypto.randomUUID(),
              interviewStatus: job.data?.interviewStatus || "PROGRESS",
              ...updateData,
            },
          });
        } catch {
          await persistInterviewUpdateRaw({
            applicationId,
            recordingUrl: recordingUrlToPersist,
            transcript: job.data?.transcript,
            interviewStatus: job.data?.interviewStatus,
          });
        }
        if (recordingDisabled) {
          console.log(`[FINALIZE] Recording disabled for ${applicationId}; stored disabled state in recording JSON.`);
        }
        if (recordingUrlToPersist && job.data?.interviewStatus === "COMPLETED") {
          const persistedInterview = await prisma.interview.findUnique({
            where: { applicationId },
            select: { interviewCompletedAt: true },
          });
          await scheduleRecordingRetentionDeletion({
            applicationId,
            completedAt: persistedInterview?.interviewCompletedAt || new Date(),
            retentionDays: recordingSettings.recordingRetentionDays,
            recordingUrl: recordingUrlToPersist,
          }).catch((error) => {
            console.warn(`[RETENTION] Failed to schedule cleanup for ${applicationId}:`, error);
          });
        }
        if (job.data?.appStatus) {
          await prisma.$executeRawUnsafe(
            'UPDATE "Application" SET "resumeScreeningStatus" = $1, "applicationUpdatedAt" = NOW() WHERE id = $2',
            job.data?.appStatus,
            applicationId
          );
        }
        console.log(`[SUCCESS] Interview finalization persisted for ${applicationId}`);
        // -- 1b. Notify org admins that the interview is complete --------------
        if (job.data?.interviewStatus === "COMPLETED") {
          try {
            const appForNotify = await prisma.application.findUnique({
              where: { id: applicationId },
              select: {
                candidateFullName: true,
                candidateEmail: true,
                job: {
                  select: {
                    title: true,
                    organizationId: true,
                    organization: { select: { name: true } },
                  },
                },
              },
            });
            if (appForNotify?.candidateEmail) {
              const { sendCandidateInterviewCompletedEmail } = await import('./lib/mail');
              await sendCandidateInterviewCompletedEmail({
                email: appForNotify.candidateEmail,
                fullName: appForNotify.candidateFullName || "Candidate",
                jobTitle: appForNotify.job?.title || "Unknown Role",
                orgName: appForNotify.job?.organization?.name || "Sreeva AI",
              });
              console.log(`[MAIL] Interview completed notification sent to candidate for ${applicationId}`);
            }
          } catch (notifyError) {
            console.warn(`[MAIL] Failed to send interview completed notifications for ${applicationId}:`, notifyError);
          }
        }
        return { success: true };
      } catch (error) {
        console.error(`[Interview Finalization Worker Error]:`, error);
        throw error;
      }
    },
    {
      connection: redisConnection,
      prefix: BULL_PREFIX,
      concurrency: 100,
      lockDuration: 10 * 60 * 1000,    // 10 min lock — report generation can take a while
      stalledInterval: 5 * 60 * 1000,
      maxStalledCount: 1,
      removeOnComplete: { age: 60 },
      removeOnFail: { age: 60 },
    }
  ));
  interviewFinalizationWorker.on("failed", (job, err) => {
    console.log(`[FATAL] Interview Finalization Job ${job?.id} failed permanently: ${err.message}`);
    logWorkerError({
      error: err.message,
      reason: "Interview finalization job failed permanently",
      context: { jobId: job?.id, applicationId: job?.data?.applicationId },
    });
  });
  interviewFinalizationWorker.on("active", (job) => {
    console.log(`[interview-finalization] ▶ Started: id="${job.id}" app="${job.data?.applicationId}"`);
  });
  interviewFinalizationWorker.on("completed", (job) => {
    console.log(`[interview-finalization] ✓ Ended: id="${job.id}" app="${job.data?.applicationId}"`);
  });
}
/**
 * INTERVIEW RECORDING WORKER
 * Finalizes server-side LiveKit egress recordings after stop is requested.
 * Verifies recording availability in R2, persists final metadata, and
 * enqueues interview finalization/report generation.
 */
if (isQueueEnabled("interview-recording")) {
  const interviewRecordingWorker = trackWorker("interview-recording", new Worker(
    "interview-recording",
    async (job) => {
      const { egressId, roomName } = job.data || {};
      console.log(`\n=================================================`);
      console.log(`▶ [INTERVIEW EGRESS WORKER] Triggered! Room: ${roomName}`);
      console.log(`=================================================\n`);
      if (job.name !== "finalize-egress-recording") {
        console.warn(`[RECORDING_WORKER] Skipping unsupported job name: ${job.name}`);
        return { skipped: true, reason: "unsupported_job_name" };
      }
      const {
        applicationId,
        recordingKey,
        recordingUrl,
        startedAt: startedAtRaw,
        mimeType = "video/mp4",
      } = job.data || {};
      if (!applicationId) {
        throw new Error("Missing applicationId in finalize-egress-recording job");
      }
      const bucket = process.env.R2_INTERVIEW_BUCKET || "interview";
      const publicBase = String(process.env.NEXT_PUBLIC_R2_INTERVIEW_URL || "").trim().replace(/\/$/, "");
      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: {
          candidateFullName: true,
          job: {
            select: {
              organizationId: true,
              title: true,
              jobRole: true,
            },
          },
        },
      });
      const orgId = String(application?.job?.organizationId || "");
      const recordingSettings = orgId
        ? await getOrgRecordingSettings(orgId)
        : { recordingEnabled: false, recordingRetentionDays: null };
      const interviewRow = await prisma.interview.findUnique({
        where: { applicationId },
        select: {
          sessionRecording: true,
        },
      });
      const existingRecording = normalizeRecordingState(interviewRow?.sessionRecording);
      const manifest = parseJsonRecord(existingRecording.manifest);
      const resolvedKey = String(recordingKey || existingRecording.key || manifest.recordingKey || "").trim();
      const resolvedUrl = String(
        recordingUrl
        || existingRecording.url
        || manifest.recordingUrl
        || (resolvedKey && publicBase ? `${publicBase}/${resolvedKey}` : "")
      ).trim();
      if (!resolvedKey && !resolvedUrl) {
        throw new Error(`[RECORDING_WORKER] Missing recording key/url for ${applicationId}`);
      }
      if (resolvedKey) {
        try {
          await headObjectStrict(bucket, resolvedKey);
        } catch (probeError) {
          throw new Error(
            `[RECORDING_WORKER] Egress output not available yet for ${applicationId} in bucket ${bucket}: ${resolvedKey}`
          );
        }
      }
      const completedAt = new Date();
      const startedFromPayload = startedAtRaw ? new Date(String(startedAtRaw)) : null;
      const startedFromManifest = manifest.startedAt ? new Date(String(manifest.startedAt)) : null;
      const startedAt =
        (startedFromPayload && Number.isFinite(startedFromPayload.getTime()) ? startedFromPayload : null)
        || (startedFromManifest && Number.isFinite(startedFromManifest.getTime()) ? startedFromManifest : null)
        || (existingRecording.startedAt ? new Date(existingRecording.startedAt) : null)
        || null;
      const durationSec =
        startedAt && Number.isFinite(startedAt.getTime())
          ? Math.max(1, Math.round((completedAt.getTime() - startedAt.getTime()) / 1000))
          : null;
      const retentionDays = recordingSettings.recordingRetentionDays;
      const retentionDueAt = computeRecordingRetentionDueAt(completedAt, retentionDays);
      const nextManifest = {
        ...manifest,
        mode: "livekit_egress",
        egressId: String(egressId || manifest.egressId || "").trim() || null,
        recordingKey: resolvedKey || null,
        recordingUrl: resolvedUrl || null,
        stoppedAt: manifest.stoppedAt || completedAt.toISOString(),
        finalizedAt: completedAt.toISOString(),
        retentionDays,
        retentionDueAt: retentionDueAt ? retentionDueAt.toISOString() : null,
        lastStatus: "COMPLETED",
        lastError: null,
      };
      const shouldStoreRecording = Boolean(recordingSettings.recordingEnabled);
      if (!shouldStoreRecording) {
        const deleteResult = await deleteRecordingAsset({
          recordingUrl: resolvedUrl || null,
          recordingKey: resolvedKey || null,
          recordingManifest: nextManifest,
          bucket,
          attempts: 3,
          baseDelayMs: 1000,
        });
        if (!deleteResult.success) {
          throw new Error(deleteResult.lastError || `[RECORDING_WORKER] Failed to delete disabled recording for ${applicationId}`);
        }
      }
      const recordingUrlToPersist = shouldStoreRecording ? (resolvedUrl || null) : null;
      const recordingRetentionDaysToPersist = shouldStoreRecording ? retentionDays : null;
      const recordingRetentionDueAtToPersist = shouldStoreRecording ? retentionDueAt : null;
      const recordingCleanupStatusToPersist = shouldStoreRecording ? "PENDING" : "COMPLETED";
      const recordingCleanupAttemptsToPersist = shouldStoreRecording ? 0 : 1;
      const recordingCleanupLastErrorToPersist = null;
      const recordingDeletedAtToPersist = shouldStoreRecording ? null : completedAt;
      const recordingName = [application?.candidateFullName, application?.job?.title || application?.job?.jobRole]
        .filter(Boolean)
        .join(" ") || applicationId;
      const recordingToPersist = mergeRecordingState(interviewRow?.sessionRecording, {
        name: recordingName,
        mode: "livekit_egress",
        status: shouldStoreRecording ? "COMPLETED" : "ABORTED",
        mimeType,
        url: recordingUrlToPersist,
        key: resolvedKey || null,
        egressId: String(egressId || nextManifest.egressId || "").trim() || null,
        completedAt: completedAt.toISOString(),
        recordedAt: recordingUrlToPersist ? completedAt.toISOString() : null,
        durationSec,
        manifest: shouldStoreRecording ? nextManifest : null,
        retention: {
          days: recordingRetentionDaysToPersist,
          dueAt: recordingRetentionDueAtToPersist ? recordingRetentionDueAtToPersist.toISOString() : null,
          cleanupStatus: recordingCleanupStatusToPersist,
          cleanupAttempts: recordingCleanupAttemptsToPersist,
          cleanupLastError: recordingCleanupLastErrorToPersist,
          deletedAt: recordingDeletedAtToPersist ? recordingDeletedAtToPersist.toISOString() : null,
        },
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "Interview"
         SET "durationInSeconds" = CASE WHEN $1::integer IS NOT NULL THEN $1::integer ELSE "durationInSeconds" END,
             "sessionRecording" = $2::jsonb,
             "interviewUpdatedAt" = NOW()
         WHERE "applicationId" = $3::text`,
        durationSec,
        JSON.stringify(recordingToPersist),
        applicationId
      );
      if (shouldStoreRecording) {
        await scheduleRecordingRetentionDeletion({
          applicationId,
          completedAt,
          retentionDays,
          recordingUrl: resolvedUrl || null,
          recordingKey: resolvedKey || null,
          recordingManifest: nextManifest,
        }).catch((error) => {
          console.warn(`[RECORDING_RETENTION] Failed to schedule cleanup for ${applicationId}:`, error);
        });
      }
      const finalizationQueue = new Queue("interview-finalization", { connection: redisConnection, prefix: BULL_PREFIX });
      await finalizationQueue.add(
        "finalize-interview",
        {
          applicationId,
          recordingUrl: resolvedUrl || null,
          interviewStatus: "COMPLETED",
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: { age: 60 },
          removeOnFail: { age: 60 },
        }
      );
      await finalizationQueue.close();
      console.log(`[RECORDING_WORKER] Egress finalized for ${applicationId} (egress=${egressId || "unknown"})`);
      return {
        success: true,
        applicationId,
        egressId: egressId || null,
        recordingKey: resolvedKey || null,
        recordingUrl: resolvedUrl || null,
        durationSec,
      };
    },
    {
      connection: redisConnection,
      prefix: BULL_PREFIX,
      concurrency: 100,
      lockDuration: 5 * 60 * 1000,
      stalledInterval: 2 * 60 * 1000,
      maxStalledCount: 1,
      removeOnComplete: { age: 60 },
      removeOnFail: { age: 60 },
    }
  ));
  interviewRecordingWorker.on("failed", (job, err) => {
    console.error(
      `[FATAL] Egress Finalize Job ${job?.id} failed permanently for ${job?.data?.applicationId}: ${err.message}`
    );
    logLiveKitError({
      applicationId: job?.data?.applicationId,
      error: err.message,
      reason: "Egress/recording finalization job failed permanently",
      phase: "recording_finalize",
    });
  });
  interviewRecordingWorker.on("active", (job) => {
    console.log(`[interview-recording] ▶ Started: id="${job.id}" app="${job.data?.applicationId}"`);
  });
  interviewRecordingWorker.on("completed", (job) => {
    console.log(`[interview-recording] ✓ Ended: id="${job.id}" app="${job.data?.applicationId}"`);
  });
}
/**
 * ðŸ“¸ INTERVIEW SNAPSHOT WORKER
 * Handles proctoring snapshot uploads to R2 and DB persistence.
 * Optimized for low-memory Redis (32MB).
 */
if (isQueueEnabled("interview-snapshots")) {
  const interviewSnapshotWorker = trackWorker("interview-snapshots", new Worker(
    "interview-snapshots",
    async (job) => {
      const { imageDataUrl, applicationId, label, candidateName } = job.data;
      if (!imageDataUrl || !applicationId) {
        throw new Error("Missing required data for snapshot job");
      }
      console.log(`[JOB] Processing proctoring snapshot for App: ${applicationId}`);
      try {
        // 1. Process Image Buffer
        const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        // 2. Fetch Application details for folder naming
        const application = await prisma.application.findUnique({
          where: { id: applicationId },
          select: {
            candidateFullName: true,
            job: { select: { title: true, organization: { select: { urlSlug: true } } } },
          },
        });
        // 3. Resolve Folder & Key
        const orgSlug = application?.job?.organization?.urlSlug || "unknown-org";
        const jobTitle = (application?.job?.title || "unknown-job").replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const candName = (application?.candidateFullName || candidateName || applicationId)
          .replace(/[^a-zA-Z0-9_\- ]/g, "")
          .trim()
          .replace(/\s+/g, "_")
          .toLowerCase();
        const timestamp = Date.now();
        const snapshotLabel = label || "snapshot";
        const key = `interview/${orgSlug}/${jobTitle}/${candName}/snapshots/${snapshotLabel}_${timestamp}.jpg`;
        const bucket = process.env.R2_INTERVIEW_BUCKET || "interview";
        // 4. Upload to R2
        const url = await putObject(bucket, key, buffer, "image/jpeg");
        // 5. Update Database (Atomic Push)
        const appForSnapshot = await prisma.application.findUnique({
          where: { id: String(applicationId) },
          select: { id: true, candidateFullName: true }
        });
        if (!appForSnapshot) {
          console.warn(`[SKIP] Application ${applicationId} not found. Candidate may have been deleted.`);
          return { skipped: true };
        }
        await prisma.interview.upsert({
          where: { applicationId: String(applicationId) },
          update: {
            proctoringSnapshotUrls: {
              push: url
            }
          },
          create: {
            id: generateId("int", appForSnapshot?.candidateFullName || String(applicationId)),
            applicationId: String(applicationId),
            candidateInviteToken: crypto.randomUUID(),
            proctoringSnapshotUrls: [url],
            interviewStatus: "PENDING"
          }
        });
        console.log(`[SUCCESS] Snapshot persisted for ${applicationId} -> ${url}`);
        return { url };
      } catch (error) {
        console.error(`[Snapshot Worker Error]:`, error);
        throw error;
      }
    },
    {
      connection: redisConnection,
      prefix: BULL_PREFIX,
      concurrency: 100, // Process snapshots in parallel to clear Redis memory fast
      lockDuration: 30000,
      removeOnComplete: { age: 60 },
      removeOnFail: { age: 60 },
    }
  ));
  interviewSnapshotWorker.on("failed", (job, err) => {
    console.log(`[FATAL] Snapshot Job ${job?.id} failed: ${err.message}`);
    logWorkerError({
      error: err.message,
      reason: "Interview snapshot job failed",
      context: { jobId: job?.id, applicationId: job?.data?.applicationId },
    });
  });
  interviewSnapshotWorker.on("active", (job) => {
    console.log(`[interview-snapshots] ▶ Started: id="${job.id}" app="${job.data?.applicationId}"`);
  });
  interviewSnapshotWorker.on("completed", (job) => {
    console.log(`[interview-snapshots] ✓ Ended: id="${job.id}" app="${job.data?.applicationId}"`);
  });
}
/**
 * ðŸ“„ JD UPLOAD WORKER
 * Handles asynchronous uploading of AI-generated JD PDFs to Cloudflare R2.
 */
if (isQueueEnabled("jd-upload")) {
  const jdUploadWorker = trackWorker("jd-upload", new Worker(
    "jd-upload",
    async (job) => {
      const { bucket, key, buffer, contentType, orgId } = job.data;
      if (!bucket || !key || !buffer) {
        throw new Error("Missing required data for JD upload job");
      }
      console.log(`[JOB] Background upload starting for: ${key}`);
      try {
        // Redis/BullMQ might serialize Buffer as {type: 'Buffer', data: [...]}
        // We ensure we have a real Buffer before uploading.
        // Check Buffer.isBuffer first to prevent corruption if it's already a Buffer.
        const fileBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer.data || buffer);
        await putObject(bucket, key, fileBuffer, contentType || "application/pdf");
        console.log(`[SUCCESS] JD PDF uploaded to R2: ${key}`);
        return { success: true, key };
      } catch (error) {
        console.error(`[JD Upload Worker Error]:`, error);
        throw error;
      }
    },
    {
      connection: redisConnection,
      prefix: BULL_PREFIX,
      concurrency: 10, // Efficient parallel uploads
      removeOnComplete: { age: 60 },
      removeOnFail: { age: 60 },
    }
  ));
  jdUploadWorker.on("failed", (job, err) => {
    console.log(`[FATAL] JD Upload Job ${job?.id} failed: ${err.message}`);
    const orgId = job?.data?.orgId as string | undefined;
    if (orgId) {
      prisma.organizationDetails.findUnique({ where: { id: orgId }, select: { name: true } })
        .then((org) => {
          logJobError({
            orgName: org?.name || orgId,
            jobName: "JD Upload",
            operation: "upload_jd",
            error: err.message,
            reason: "JD upload worker job failed",
          });
        })
        .catch(() => {
          logJobError({
            orgName: orgId,
            jobName: "JD Upload",
            operation: "upload_jd",
            error: err.message,
            reason: "JD upload worker job failed (org lookup failed)",
          });
        });
    } else {
      logWorkerError({
        error: err.message,
        reason: "JD upload worker job failed with no orgId in job data",
        context: { jobId: job?.id },
      });
    }
  });
  jdUploadWorker.on("active", (job) => {
    console.log(`[jd-upload] ▶ Started: id="${job.id}" key="${job.data?.key}"`);
  });
  jdUploadWorker.on("completed", (job) => {
    console.log(`[jd-upload] ✓ Ended: id="${job.id}" key="${job.data?.key}"`);
  });
}

/**
 * 📄 JD EXTRACTION WORKER
 * Processes jobs enqueued by /api/extract for JD files/text.
 * Calls extract_pdf.py with doc_type=JD and returns { text, data, usage }.
 * No DB writes -- caller polls /api/extract/status/[jobId] for the result.
 */
if (isQueueEnabled("jd-extraction")) {
  const jdExtractionWorker = trackWorker("jd-extraction", new Worker(
    JD_EXTRACTION_QUEUE_NAME,
    async (job, token) => {
      console.log(`\n=================================================`);
      console.log(`▶ [JD-EXTRACTION WORKER] PID=${process.pid} Job id="${job.id}" kind="${job.data?.kind}"`);
      console.log(`=================================================\n`);
      return processJdExtractionViaModal(job, token);
    },
    {
      connection: redisConnection,
      prefix: BULL_PREFIX,
      concurrency: 70, // global cap -- Modal handles ~100 concurrent jobs; per-org cap enforced inside processJdExtractionViaModal (lib/modal-concurrency.ts)
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 25 },
    }
  ));
  jdExtractionWorker.on("failed", (job, err) => {
    console.error(`[JD-EXTRACTION WORKER] Job ${job?.id} failed: ${err.message}`);
    const orgId = job?.data?.orgId as string | undefined;
    if (orgId) {
      prisma.organizationDetails.findUnique({ where: { id: orgId }, select: { name: true } })
        .then((org) => {
          logJobError({
            orgName: org?.name || orgId,
            jobName: "JD Extraction",
            operation: "upload_jd",
            error: err.message,
            reason: "JD extraction worker job failed",
          });
        })
        .catch(() => {
          logJobError({
            orgName: orgId,
            jobName: "JD Extraction",
            operation: "upload_jd",
            error: err.message,
            reason: "JD extraction worker job failed (org lookup failed)",
          });
        });
    } else {
      logWorkerError({
        error: err.message,
        reason: "JD extraction worker job failed with no orgId in job data",
        context: { jobId: job?.id },
      });
    }
  });
}

/**
 * 📋 BRIEF GENERATION WORKER
 * Pre-generates the InterviewBrief for real candidates who book a slot.
 * Called from POST /api/schedule/[token] after scheduledAt is saved.
 * Runs generate_brief.py which: fetches resume + JD → LLM call → saves to DB.
 * Test interviews NEVER use this queue — they always generate live in agent_runtime.py.
 */
if (isQueueEnabled("brief-generation")) {
  const briefWorker = trackWorker("brief-generation", new Worker(
    "brief-generation",
    async (job, token) => {
      const { applicationId } = job.data || {};
      if (!applicationId) throw new Error("[BRIEF-WORKER] Missing applicationId in job data");

      console.log(`\n=================================================`);
      console.log(`▶ [BRIEF-WORKER] PID=${process.pid} Job id="${job.id}" applicationId="${applicationId}"`);
      console.log(`=================================================\n`);

      // Confirm Interview row still exists before spinning up Python
      const interview = await prisma.interview.findUnique({
        where: { applicationId },
        select: {
          id: true, isTestSession: true, interviewScheduledAt: true, aiInterviewBrief: true,
          application: { select: { job: { select: { organizationId: true } } } },
        },
      });

      if (!interview) {
        console.warn(`[BRIEF-WORKER] Interview not found for ${applicationId} — skipping`);
        return { skipped: true, reason: "interview_not_found" };
      }
      if (interview.isTestSession) {
        // Safety guard: should never happen since test token route doesn't enqueue this,
        // but guard explicitly so we never overwrite a test session's brief.
        console.warn(`[BRIEF-WORKER] Skipping — isTestSession=true for ${applicationId}`);
        return { skipped: true, reason: "is_test_session" };
      }
      if (interview.aiInterviewBrief) {
        console.log(`[BRIEF-WORKER] Brief already exists for ${applicationId} — skipping re-generation`);
        return { skipped: true, reason: "brief_already_exists" };
      }

      const orgId = interview.application?.job?.organizationId;
      job.data.orgId = orgId; // processBriefGenerationViaModal reads job.data.orgId
      return processBriefGenerationViaModal(job, token);
    },
    {
      connection: createRedisConnection(),
      prefix: BULL_PREFIX,
      concurrency: 70, // global cap -- Modal handles ~100 concurrent jobs; per-org cap enforced inside processBriefGenerationViaModal (lib/modal-concurrency.ts)
      lockDuration: 4 * 60 * 1000, // 4 min lock — longer than the 3-min timeout
      removeOnComplete: { age: 60 },
      removeOnFail:    { age: 3600 },
    }
  ));

  briefWorker.on("failed", (job, err) => {
    console.error(`[BRIEF-WORKER] Job ${job?.id} failed for applicationId=${job?.data?.applicationId}: ${err.message}`);
    // Non-fatal — agent_runtime.py will fall back to live generation
  });
}

/**
 * 📋 INTERVIEW REPORT WORKER
 * Runs the post-interview report/summary/billing-snapshot/debug-PDF tail that
 * used to run inline inside the LiveKit agent job. Moved here because LiveKit
 * Cloud recycles the agent job process shortly after the room closes, which
 * risked killing the ~300s report pipeline mid-flight. Enqueued by
 * POST /api/internal/interview-report right after the agent persists the
 * transcript/scores. All report/billing/Slack logic now runs on Modal
 * (modal_app/generate_report.py) — this just dispatches the HTTP call via
 * lib/modal-dispatch.ts, gated by per-org concurrency.
 */
if (isQueueEnabled("interview-report")) {
  const interviewReportWorker = trackWorker("interview-report", new Worker(
    "interview-report",
    async (job, token) => {
      const appId = job.data?.appId;
      if (!appId) throw new Error("[REPORT-WORKER] Missing appId in job data");

      console.log(`\n=================================================`);
      console.log(`▶ [REPORT-WORKER] PID=${process.pid} Job id="${job.id}" appId="${appId}"`);
      console.log(`=================================================\n`);

      const app = await prisma.application.findUnique({
        where: { id: appId },
        select: { job: { select: { organizationId: true } } },
      });
      const orgId = app?.job?.organizationId;
      job.data.orgId = job.data.orgId ?? orgId;
      return processInterviewReportViaModal(job, token);
    },
    {
      connection: createRedisConnection(),
      prefix: BULL_PREFIX,
      concurrency: 70, // global cap -- Modal handles ~100 concurrent jobs; per-org cap enforced inside processInterviewReportViaModal (lib/modal-concurrency.ts)
      lockDuration: 6 * 60 * 1000,  // 6 min, matches the 340s script timeout + margin
      stalledInterval: 5 * 60 * 1000,
      maxStalledCount: 1,
      removeOnComplete: { age: 3600 },
      removeOnFail:    { age: 86400 },
    }
  ));

  interviewReportWorker.on("failed", (job, err) => {
    console.error(`[REPORT-WORKER] Job ${job?.id} failed permanently for appId=${job?.data?.appId}: ${err.message}`);
    logWorkerError({
      error: err.message,
      reason: "Interview report job failed permanently",
      context: { jobId: job?.id, appId: job?.data?.appId },
    });
  });
}

console.log("[Worker] Started. Listening for enabled queues.");

/**
 * REDIS CONFIGURATION & CRON SETUP
 * Attempts to set safe Redis settings and register repeatable jobs.
 */
async function initializeWorkerMetadata() {
  try {
    // Attempt to set eviction policy to noeviction for BullMQ stability
    // Note: Many managed providers (like Redis Cloud free) block this command
    try {
      await redisConnection.config('SET', 'maxmemory-policy', 'noeviction');
    } catch (configErr: any) {
      console.warn(`Could not set Redis eviction policy (provider restricted): ${configErr.message}`);
      console.warn("Running queue cleanup to free memory instead...");
    }
    if (await shouldSkipCronRegistration()) {
      console.warn("Cron registration skipped because Redis is still near its memory limit.");
      return;
    }
    if (setupRetentionCronJobs) {
      try {
        await setupRetentionCronJobs();
      } catch (cronErr: any) {
        console.error("  ?? ?? Failed to register recording retention sweep:", cronErr.message);
      }
    }
  } catch (err: any) {
    console.error("[Worker] Critical error during metadata initialization:", err.message);
  }
}
initializeWorkerMetadata();
