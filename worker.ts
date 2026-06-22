import 'dotenv/config'; // must be FIRST — ensures .env is loaded before any lib reads process.env
import { Worker, Queue } from 'bullmq';
import crypto from 'crypto';
import { join } from 'path';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { writeFile, unlink, readdir, stat } from 'fs/promises';
import { prisma } from './lib/prisma';
import redisConnection, { createRedisConnection, getBullPrefix } from './lib/redis';
import { putObject, getObjectBuffer, headObjectStrict } from "./lib/s3";
import { generateId } from "./lib/ids";
import { isInterviewTokenRequired } from "./lib/interview-access";
import { appendCandidateActivity } from "./lib/candidate-activity";
import { getPythonExecutable } from "./lib/python-exec";
import { recordOrgBillingUsage } from "./lib/usage-metrics";
import { buildInterviewLink } from "./lib/interview-links";
import { Prisma } from "@prisma/client";
import { recordingRetentionQueue, invitationDeliveryQueue } from "./lib/queue";
import {
  computeRecordingRetentionDueAt,
  deleteRecordingAsset,
  extractRecordingKey,
  getOrgRecordingSettings,
  RECORDING_RETENTION_SWEEP_JOB,
  scheduleRecordingRetentionDeletion,
} from "./lib/recording-retention";
import { mergeRecordingState, normalizeRecordingState, parseJsonRecord } from "./lib/recording-state";

if (!process.env.REDIS_URL) {
  console.error('FATAL: REDIS_URL is missing from environment variables!');
  process.exit(1);
}

void redisConnection.connect().catch(() => { }); // force-connect before BullMQ workers start
const pythonCmd = getPythonExecutable();
// BullMQ key prefix — MUST match lib/queue.ts so this worker consumes the same
// queues the API enqueues to. Set BULLMQ_PREFIX to isolate dev/prod on shared Redis.
const BULL_PREFIX = getBullPrefix();
console.log(`[Worker] PID=${process.pid}`);
console.log(`[Worker] BullMQ prefix="${BULL_PREFIX}"`);

// Core spawn runner with hard timeout + guaranteed slot release. `stdinPayload`
// optional. On timeout the process is SIGKILLed so it can't linger.
function spawnPythonJson(args: string[], stdinPayload: string | null, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    let out = "";
    let settled = false;
    const p = spawn(pythonCmd, args);
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    const timer = setTimeout(() => {
      try { p.kill("SIGKILL"); } catch { /* already dead */ }
      finish(() => reject(new Error(`python timed out after ${timeoutMs}ms`)));
    }, timeoutMs);
    p.stdout.on("data", (data) => { out += data.toString(); });
    // Stream Python progress lines directly to console in real time.
    p.stderr.on("data", (data) => { process.stderr.write(`[PY] ${data}`); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish(() => reject(new Error(`python exited with code ${code}`)));
        return;
      }
      try {
        const parsed = JSON.parse(out);
        finish(() => resolve(parsed));
      } catch (e: any) {
        finish(() => reject(new Error(`Invalid python JSON: ${e.message}\nraw stdout: ${out.slice(0, 500)}`)));
      }
    });
    p.on("error", (error) => {
      clearTimeout(timer);
      finish(() => reject(error));
    });
    if (stdinPayload !== null) {
      p.stdin.write(stdinPayload);
      p.stdin.end();
    }
  });
}
async function runPythonJson(args: string[], timeoutMs = 180000): Promise<any> {
  return spawnPythonJson(args, null, timeoutMs);
}
async function runPythonJsonWithStdin(args: string[], stdinPayload: string, timeoutMs = 180000): Promise<any> {
  return spawnPythonJson(args, stdinPayload, timeoutMs);
}
/**
 * TEMP-FILE JANITOR (#10)
 * `finally`-based unlink doesn't run on SIGKILL/OOM, so stale temp PDFs/JSON
 * accumulate and eventually exhaust disk. This sweeps os.tmpdir() for our known
 * prefixes older than 1 hour. Runs at boot and every 6 hours.
 */
const TEMP_FILE_PREFIXES = ["drive_resume_", "drive_score_", "resume_extract_", "scoring_"];
async function sweepTempFiles() {
  const dir = tmpdir();
  const maxAgeMs = 60 * 60 * 1000; // 1 hour
  let removed = 0;
  try {
    const entries = await readdir(dir);
    for (const name of entries) {
      if (!TEMP_FILE_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
      const full = join(dir, name);
      try {
        const info = await stat(full);
        if (Date.now() - info.mtimeMs > maxAgeMs) {
          await unlink(full).catch(() => { });
          removed += 1;
        }
      } catch { /* file vanished — ignore */ }
    }
  } catch (err: any) {
    console.warn(`[TEMP-JANITOR] Sweep failed: ${err?.message}`);
    return;
  }
  if (removed > 0) console.log(`[TEMP-JANITOR] Removed ${removed} stale temp file(s).`);
}

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
      startedAt: true,
      status: true,
      accessToken: true,
      linkStatus: true,
    },
  });
  if (existingInterview?.startedAt) {
    console.log(
      `[INTERVIEW-START] Interview already started for ${applicationId} at ${existingInterview.startedAt.toISOString()}`
    );
    await prisma.application.update({
      where: { id: applicationId },
      data: { interviewStatus: "IN_PROGRESS" },
    }).catch(() => { });
    return {
      success: true,
      alreadyStarted: true,
      applicationId,
      startedAt: existingInterview.startedAt.toISOString(),
    };
  }
  const interviewAccessToken = existingInterview?.accessToken || accessToken || crypto.randomUUID();
  await prisma.interview.upsert({
    where: { applicationId },
    update: {
      status: "IN_PROGRESS",
      startedAt: startedAtCandidate,
      linkStatus: "ACTIVE",
    },
    create: {
      id: generateId("int", applicationId),
      applicationId,
      accessToken: interviewAccessToken,
      status: "IN_PROGRESS",
      startedAt: startedAtCandidate,
      linkStatus: "ACTIVE",
    },
  });
  await prisma.application.update({
    where: { id: applicationId },
    data: { interviewStatus: "IN_PROGRESS" },
  });
  console.log(
    `[INTERVIEW-START] Persisted start time for ${applicationId} at ${startedAtCandidate.toISOString()}`
  );
  return {
    success: true,
    applicationId,
    startedAt: startedAtCandidate.toISOString(),
    linkStatus: existingInterview?.linkStatus || "ACTIVE",
    interviewStatus: "IN_PROGRESS",
  };
}
async function processRecordingRetentionSweepJob(job: any) {
  const rows = await prisma.$queryRaw<Array<{
    applicationId: string;
    recording: unknown;
  }>>(
    Prisma.sql`
      SELECT
        i."applicationId",
        i."recording"
      FROM "Interview" i
      JOIN "Application" a ON a.id = i."applicationId"
      JOIN "Drive" d ON d.id = a."driveId"
      JOIN "Organization" o ON o.id = d."orgId"
      WHERE COALESCE(
          NULLIF(i."recording"->>'url', ''),
          NULLIF(i."recording"->'manifest'->>'recordingUrl', '')
        ) IS NOT NULL
        AND COALESCE(i."recording"->'retention'->>'deletedAt', '') = ''
        AND (
          (NULLIF(i."recording"->'retention'->>'dueAt', '')::timestamp IS NOT NULL
            AND NULLIF(i."recording"->'retention'->>'dueAt', '')::timestamp <= NOW())
          OR (
            NULLIF(i."recording"->'retention'->>'dueAt', '') IS NULL
            AND COALESCE(
              NULLIF(i."recording"->>'completedAt', '')::timestamp,
              NULLIF(i."recording"->>'recordedAt', '')::timestamp,
              CASE
                WHEN NULLIF(i."recording"->>'startedAt', '') IS NOT NULL
                  AND NULLIF(i."recording"->>'durationSec', '') IS NOT NULL
                THEN NULLIF(i."recording"->>'startedAt', '')::timestamp
                  + (NULLIF(i."recording"->>'durationSec', '')::integer * INTERVAL '1 second')
                ELSE NULL
              END,
              NULLIF(i."recording"->'manifest'->>'startedAt', '')::timestamp,
              i."completedAt"
            ) + (
              GREATEST(COALESCE(NULLIF(i."recording"->'retention'->>'days', '')::integer, o."recordingRetentionDays"), 1) * INTERVAL '1 day'
            ) <= NOW()
          )
        )
      ORDER BY COALESCE(
        NULLIF(i."recording"->'retention'->>'dueAt', '')::timestamp,
        NULLIF(i."recording"->>'completedAt', '')::timestamp,
        NULLIF(i."recording"->>'recordedAt', '')::timestamp,
        CASE
          WHEN NULLIF(i."recording"->>'startedAt', '') IS NOT NULL
            AND NULLIF(i."recording"->>'durationSec', '') IS NOT NULL
          THEN NULLIF(i."recording"->>'startedAt', '')::timestamp
            + (NULLIF(i."recording"->>'durationSec', '')::integer * INTERVAL '1 second')
          ELSE NULL
        END,
        NULLIF(i."recording"->'manifest'->>'startedAt', '')::timestamp,
        i."completedAt",
        i."updatedAt"
      ) ASC
      LIMIT 100
    `
  );
  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    const recordingState = normalizeRecordingState(row.recording);
    const attempt = Math.max(1, Number(recordingState.retention?.cleanupAttempts || 0) + 1);
    const manifestRecord = parseJsonRecord(recordingState.manifest);
    const recordingUrl = String(recordingState.url || manifestRecord.recordingUrl || "").trim() || null;
    const recordingManifest = recordingState.manifest;
    const recordingKey = extractRecordingKey({
      recordingUrl,
      recordingManifest,
      recording: row.recording,
    });
    await prisma.interview.update({
      where: { applicationId: row.applicationId },
      data: {
        recording: mergeRecordingState(row.recording, {
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
      recording: row.recording,
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
          recording: mergeRecordingState(row.recording, {
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
        recording: mergeRecordingState(row.recording, {
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
    select: { interviewTranscript: true, recording: true },
  });
  const existingTranscript = String(existingInterview?.interviewTranscript || "").trim();
  const incomingTranscript = String(transcript || "").trim();
  const transcriptToPersist = incomingTranscript && incomingTranscript.length >= existingTranscript.length
    ? incomingTranscript
    : existingTranscript;
  const recordingToPersist = recordingUrl
    ? mergeRecordingState(existingInterview?.recording, {
      status: interviewStatus === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
      url: recordingUrl,
      recordedAt: now.toISOString(),
    })
    : null;
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "Interview" ("id", "applicationId", "accessToken", status, "interviewTranscript", "recording", "completedAt", "createdAt", "updatedAt")
    VALUES ($6::text, $1::text, $7::text, COALESCE($2::text, 'IN_PROGRESS'), $4::text, COALESCE($8::jsonb, '{}'::jsonb), CASE WHEN $2::text = 'COMPLETED' THEN $5::timestamp ELSE NULL END, $5::timestamp, $5::timestamp)
    ON CONFLICT ("applicationId")
    DO UPDATE SET
      status = COALESCE($2::text, "Interview".status),
      "accessToken" = COALESCE("Interview"."accessToken", EXCLUDED."accessToken"),
      "interviewTranscript" = COALESCE($4::text, "Interview"."interviewTranscript"),
      "recording" = CASE WHEN $3::text IS NOT NULL THEN $8::jsonb ELSE "Interview"."recording" END,
      "completedAt" = CASE WHEN $2::text = 'COMPLETED' THEN $5::timestamp ELSE "Interview"."completedAt" END,
      "updatedAt" = $5::timestamp
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
// ─────────────────────────────────────────────────────────────────────────────
// RESUME SCREENING JOB
// Full pipeline: download → extract text → score against JD → write DB.
// Job name: "screen-resume"
// Job data: { applicationId, bucket, key, fileName, orgId }
// ─────────────────────────────────────────────────────────────────────────────
async function processResumeScreeningJob(job: any) {
  const {
    applicationId,
    bucket = process.env.R2_RESUMES_BUCKET || "resumes",
    key,
    fileName = "resume.pdf",
    orgId = null,
  } = job.data || {};

  if (!applicationId || !key) {
    throw new Error("Missing applicationId or key in screen-resume job");
  }

  console.log(`[RESUME-WORKER] Job ${job.id} started for ${applicationId}`);

  const tempExt = String(fileName).match(/\.[a-z0-9]+$/i)?.[0] || ".pdf";
  const tempFilePath = join(tmpdir(), `resume_extract_${String(job.id)}_${Date.now()}${tempExt}`);

  try {
    // ── 10% Upload received ────────────────────────────────────────────────
    await job.updateProgress(10);
    await prisma.application.update({
      where: { id: applicationId },
      data: { resumeStatus: "extracting", updatedAt: new Date() },
    }).catch((e: any) => console.warn(`[RESUME-WORKER] status update failed: ${e.message}`));

    // ── 20% Download from R2 ───────────────────────────────────────────────
    await job.updateProgress(20);
    console.log(`[RESUME-WORKER] Downloading from R2: ${key}`);
    const sourceBuffer = await getObjectBuffer(bucket, key);
    await writeFile(tempFilePath, sourceBuffer);
    console.log(`[RESUME-WORKER] Downloaded ${sourceBuffer.length} bytes`);

    // ── 30% Load JD config ────────────────────────────────────────────────
    await job.updateProgress(30);
    await prisma.application.update({
      where: { id: applicationId },
      data: { resumeStatus: "extracting", updatedAt: new Date() },
    }).catch(() => {});
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        drive: {
          select: {
            extractedDetails: true,
            screeningCriteria: true,
            screeningThreshold: true,
          },
        },
      },
    });

    const extractedDetails = (() => {
      try { return JSON.parse(application?.drive?.extractedDetails || "{}"); } catch { return {}; }
    })();
    const screeningCriteria = (() => {
      try { return JSON.parse(application?.drive?.screeningCriteria || "{}"); } catch { return {}; }
    })();
    const dbThreshold = application?.drive?.screeningThreshold;
    const threshold = dbThreshold || 60;
    const hasJd = Object.keys(extractedDetails).length > 0;

    console.log(`[RESUME-WORKER] Threshold from DB: ${dbThreshold} (type: ${typeof dbThreshold}), Using: ${threshold}`);

    // ── 40% Extract + 60% Score (Python subprocess) ───────────────────────
    await job.updateProgress(40);
    console.log(`[RESUME-WORKER] Updating status to "scoring"...`);
    await prisma.application.update({
      where: { id: applicationId },
      data: { resumeStatus: "scoring", updatedAt: new Date() },
    }).catch((e: any) => console.warn(`[RESUME-WORKER] Failed to update scoring status: ${e.message}`));
    console.log(`[RESUME-WORKER] Updated status to "scoring". Waiting 500ms before Python...`);
    await new Promise(r => setTimeout(r, 500)); // Give DB time to sync + frontend to poll
    console.log(`[RESUME-WORKER] Running Python pipeline (hasJd=${hasJd})...`);

    let result: any;
    if (hasJd) {
      const jdPayload = JSON.stringify({
        jd: extractedDetails,
        jd_raw_text: extractedDetails?.rawText || extractedDetails?.description || "",
        threshold,
        screening_criteria: screeningCriteria,
      });
      result = await runPythonJsonWithStdin(
        ["scripts/extract_pdf.py", tempFilePath, "RESUME_AND_SCORE", "gpt-4.1-mini", "gpt-4.1-mini"],
        jdPayload,
        180_000,
      );
    } else {
      result = await runPythonJson(
        ["scripts/extract_pdf.py", tempFilePath, "RESUME", "gpt-4.1-mini"],
        120_000,
      );
    }

    if (result?.error) throw new Error(result.error);

    // ── 70% Parse results ─────────────────────────────────────────────────
    await job.updateProgress(70);
    console.log(`[RESUME-WORKER] Python done. keys=${Object.keys(result || {}).join(",")}`);

    const scoreData  = result?.score ?? null;
    const resumeData = result?.data  ?? {};
    const resumeText = result?.text  ?? "";
    const aiScore    = typeof scoreData?.score === "number" ? Math.round(scoreData.score) : null;
    const reportJson = scoreData ? JSON.stringify(scoreData) : null;

    // ── Automatic ATS status: Determine based on score vs threshold ────────
    let resumeStatus = "pending";
    if (aiScore !== null) {
      const comparison = aiScore >= threshold;
      resumeStatus = comparison ? "shortlisted" : "rejected";
      console.log(`[RESUME-WORKER] Score check: ${aiScore} >= ${threshold} = ${comparison} → ${resumeStatus}`);
    } else {
      console.log(`[RESUME-WORKER] No aiScore found, keeping resumeStatus as pending`);
    }

    // ── 80% Write to DB ───────────────────────────────────────────────────
    await job.updateProgress(80);
    console.log(`[RESUME-WORKER] Saving to DB — applicationId=${applicationId} aiScore=${aiScore} threshold=${threshold} resumeStatus=${resumeStatus}`);

    const updateResult = await prisma.application.update({
      where: { id: applicationId },
      data: {
        resumeText,
        resumeData: JSON.stringify({ source: { bucket, key }, parsed: resumeData }),
        ...(aiScore   !== null && { aiScore }),
        ...(reportJson && { fullScanReport: reportJson, aiReport: reportJson }),
        resumeStatus,
        updatedAt: new Date(),
      },
      select: { id: true, aiScore: true, resumeStatus: true, updatedAt: true },
    });

    console.log(`[RESUME-WORKER] DB Update Success: app=${updateResult.id} aiScore=${updateResult.aiScore} resumeStatus=${updateResult.resumeStatus}`);

    // ── 90% Billing ───────────────────────────────────────────────────────
    await job.updateProgress(90);
    if (orgId) {
      const usageExtract = result?.usage_extract ?? result?.usage ?? null;
      const usageScore   = result?.usage_score   ?? null;
      if (usageExtract) {
        await recordOrgBillingUsage({
          orgId,
          feature: "resumeExtraction",
          usage: {
            model: usageExtract.model,
            inputTokens: usageExtract.inputTokens || 0,
            outputTokens: usageExtract.outputTokens || 0,
            cachedInputTokens: usageExtract.cachedInputTokens || 0,
            eventId: `resume-extraction:${job.id}`,
          },
        }).catch(() => {});
      }
      if (usageScore) {
        await recordOrgBillingUsage({
          orgId,
          feature: "resumeReport",
          usage: {
            model: usageScore.model,
            inputTokens: usageScore.inputTokens || 0,
            outputTokens: usageScore.outputTokens || 0,
            cachedInputTokens: usageScore.cachedInputTokens || 0,
            eventId: `resume-report:${job.id}`,
          },
        }).catch(() => {});
      }
    }

    // ── 100% Done ─────────────────────────────────────────────────────────
    await job.updateProgress(100);
    console.log(`[RESUME-WORKER] Job ${job.id} done for ${applicationId} — score: ${aiScore ?? "n/a"}`);
    return { applicationId, aiScore, hasScore: aiScore !== null };

  } catch (err: any) {
    console.error(`[RESUME-WORKER] Job ${job.id} failed for ${applicationId}: ${err.message}`);
    await prisma.application.update({
      where: { id: applicationId },
      data: { resumeStatus: "failed", updatedAt: new Date() },
    }).catch(() => {});
    throw err;
  } finally {
    await unlink(tempFilePath).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESUME EXTRACTION JOB (general extraction UI — /api/extract)
// Extracts + parses only; result is returned to the job for the UI to poll.
// No DB writes — the caller reads returnvalue via /api/extract/status/[jobId].
// Job name: "resume-file-extract"
// Job data: { bucket, key, fileUrl, fileName, orgId, orgOpenAIModel }
// ─────────────────────────────────────────────────────────────────────────────
async function processResumeFileExtractJob(job: any) {
  const {
    bucket = process.env.R2_RESUMES_BUCKET || "resumes",
    key,
    fileUrl = null,
    fileName = "resume.pdf",
    orgId = null,
    orgOpenAIModel = "gpt-4.1-mini",
  } = job.data || {};
  if (!key) {
    throw new Error("Invalid resume extraction job payload");
  }
  console.log(`[RESUME-WORKER] File extraction job ${job.id} started`, { fileName, bucket, key });
  const tempExt = (() => {
    const match = String(fileName).match(/\.[a-z0-9]+$/i);
    return match?.[0] || ".pdf";
  })();
  const sourceBuffer = await getObjectBuffer(bucket, key);
  const tempFilePath = join(tmpdir(), `resume_extract_${String(job.id)}_${Date.now()}${tempExt}`);
  await writeFile(tempFilePath, sourceBuffer);
  try {
    const extracted = await runPythonJson([
      "scripts/extract_pdf.py",
      tempFilePath,
      "RESUME",
      orgOpenAIModel,
    ]);
    if (extracted?.error) {
      throw new Error(extracted.error);
    }
    if (orgId && extracted?.usage) {
      await recordOrgBillingUsage({
        orgId,
        feature: "resumeExtraction",
        usage: {
          model: extracted.usage.model,
          inputTokens: extracted.usage.inputTokens || 0,
          outputTokens: extracted.usage.outputTokens || 0,
          cachedInputTokens: extracted.usage.cachedInputTokens || 0,
          eventId: `resume-file-extraction:${job.id}`,
        },
      });
    }
    console.log(`[RESUME-WORKER] File extraction job ${job.id} completed`);
    return {
      text: extracted?.text || "",
      data: extracted?.data || {},
      usage: extracted?.usage || {},
      url: fileUrl,
      bucket,
      key,
      fileName,
    };
  } finally {
    await unlink(tempFilePath).catch(() => { });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESUME PROCESSING WORKER
// Single worker, two job types:
//   "screen-resume"      — full pipeline: extract + score + write DB (from upload routes)
//   "resume-file-extract"— extract only, result returned for UI polling (/api/extract)
// Workers continuously poll the queue; as soon as a slot opens the next job starts.
// ─────────────────────────────────────────────────────────────────────────────
if (isQueueEnabled("resume-processing")) {
  const resumeWorker = trackWorker("resume-processing", new Worker("resume-processing", async (job) => {
    console.log(`\n=================================================`);
    console.log(`▶ [RESUME WORKER] PID=${process.pid} Job: name="${job.name}" id="${job.id}"`);
    console.log(`=================================================\n`);

    if (job.name === "screen-resume") {
      return await processResumeScreeningJob(job);
    }
    if (job.name === "resume-file-extract") {
      return await processResumeFileExtractJob(job);
    }
    throw new Error(`[RESUME-WORKER] Unknown job name: "${job.name}"`);
  }, {
    connection: createRedisConnection(),
    prefix: BULL_PREFIX,
    concurrency: 50,
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
  });
  resumeWorker.on("stalled", (jobId) => {
    console.warn(`[resume-processing] ⚠ Stalled: id="${jobId}"`);
  });

  void resumeWorker.waitUntilReady()
    .then(async () => {
      console.log(`[resume-processing] Worker ready. Queue="resume-processing" | Concurrency=50`);
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

  // Temp-file janitor: sweep at boot and every 6 hours.
  void sweepTempFiles();
  setInterval(() => { void sweepTempFiles(); }, 6 * 60 * 60 * 1000).unref();

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
        resumeStatus: { in: ["waiting", "processing", "extracting", "scoring", "starting"] },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, resumeStatus: true },
    });

    const orphaned = stuck.filter((row) => !liveAppIds.has(row.id));
    if (orphaned.length === 0) return;

    for (const row of orphaned) {
      await prisma.application.update({
        where: { id: row.id },
        data: {
          resumeStatus: "failed",
          aiReport: JSON.stringify({ processing: { progress: 0, stage: "failed", error: "No active screening job (reconciled)" } }),
          updatedAt: new Date(),
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
    async (job) => {
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
          email: true,
          fullName: true,
          aiScore: true,
          drive: {
            select: {
              id: true,
              title: true,
              orgId: true,
              organization: {
                select: {
                  name: true,
                },
              },
              deadline: true,
            },
          },
        },
      });
      if (!application) {
        console.warn(`[Invitation Worker] Application ${applicationId} no longer exists. Skipping.`);
        return { skipped: true, reason: "missing_application" };
      }
      if (!application.email) {
        console.warn(`[Invitation Worker] Application ${applicationId} has no email address. Skipping.`);
        return { skipped: true, reason: "missing_email" };
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sreevaai.com';
      const now = new Date();
      let interviewLink: string | undefined;
      if (action === "shortlist") {
        const driveDeadline = application.drive?.deadline ? new Date(application.drive.deadline) : null;
        const interviewRecord = await prisma.interview.upsert({
          where: { applicationId },
          update: {
            inviteSentAt: now,
            status: "PENDING",
            startedAt: null,
            completedAt: null,
            expiresAt: driveDeadline,
            linkStatus: "ACTIVE",
          },
          create: {
            id: generateId("int", application.fullName || applicationId),
            applicationId,
            accessToken: crypto.randomUUID(),
            inviteSentAt: now,
            status: "PENDING",
            expiresAt: driveDeadline,
            linkStatus: "ACTIVE",
          },
        });
        interviewLink = buildInterviewLink(appUrl, applicationId, {
          token: isInterviewTokenRequired() ? interviewRecord.accessToken : null,
          orgName: application.drive?.organization?.name || "Sreeva AI",
        });
      }
      const { sendInterviewInviteEmail, sendRejectionEmail } = await import('./lib/mail');
      let mailResult: { success: boolean; error?: string };
      if (action === "shortlist") {
        if (!interviewLink) throw new Error(`interviewLink required for action=shortlist`);
        mailResult = await sendInterviewInviteEmail({
          email: application.email,
          fullName: application.fullName || "Candidate",
          jobTitle: application.drive?.title || "Unknown Role",
          orgName: application.drive?.organization?.name || "Sreeva AI",
          interviewLink,
          schedulingDeadline: application.drive?.deadline ?? null,
        });
      } else if (action === "reject") {
        mailResult = await sendRejectionEmail({
          email: application.email,
          fullName: application.fullName || "Candidate",
          jobTitle: application.drive?.title || "Unknown Role",
          orgName: application.drive?.organization?.name || "Sreeva AI",
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
          data: { interviewStatus: "pending", updatedAt: new Date() },
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
    },
    {
      connection: redisConnection,
      prefix: BULL_PREFIX,
      concurrency: 10,
      limiter: {
        max: 10,
        duration: 60000,
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
        return await processRecordingRetentionSweepJob(job);
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
 * report in the background via Redis — no timeouts, no blocking the candidate.
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
        // ── 1. Persist transcript / recording / status ────────────────────
        const appForPolicy = await prisma.application.findUnique({
          where: { id: applicationId },
          select: {
            drive: {
              select: {
                orgId: true,
              },
            },
          },
        });
        const policyOrgId = String(appForPolicy?.drive?.orgId || "");
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
        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        const existingInterview = await prisma.interview.findUnique({
          where: { applicationId },
          select: { interviewTranscript: true, recording: true },
        });
        const existingTranscript = String(existingInterview?.interviewTranscript || "").trim();
        const incomingTranscript = String(job.data?.transcript || "").trim();
        if (recordingUrlToPersist) {
          updateData.recording = mergeRecordingState(existingInterview?.recording, {
            status: job.data?.interviewStatus === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
            url: recordingUrlToPersist,
            recordedAt: new Date().toISOString(),
          });
        } else if (recordingDisabled) {
          const deletedAt = new Date();
          updateData.recording = mergeRecordingState(existingInterview?.recording, {
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
          updateData.interviewTranscript = incomingTranscript;
        } else if (incomingTranscript) {
          console.log(
            `[FINALIZE] Skipping shorter transcript overwrite for ${applicationId} ` +
            `(incoming=${incomingTranscript.length}, existing=${existingTranscript.length})`
          );
        }
        if (job.data?.interviewStatus) {
          updateData.status = job.data?.interviewStatus;
        }
        if (job.data?.interviewStatus === "COMPLETED") {
          updateData.completedAt = new Date();
        }
        try {
          const appForId = await prisma.application.findUnique({ where: { id: applicationId }, select: { fullName: true } });
          await prisma.interview.upsert({
            where: { applicationId },
            update: updateData,
            create: {
              id: generateId("int", appForId?.fullName || applicationId),
              applicationId,
              accessToken: crypto.randomUUID(),
              status: job.data?.interviewStatus || "IN_PROGRESS",
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
            select: { completedAt: true },
          });
          await scheduleRecordingRetentionDeletion({
            applicationId,
            completedAt: persistedInterview?.completedAt || new Date(),
            retentionDays: recordingSettings.recordingRetentionDays,
            recordingUrl: recordingUrlToPersist,
          }).catch((error) => {
            console.warn(`[RETENTION] Failed to schedule cleanup for ${applicationId}:`, error);
          });
        }
        if (job.data?.appStatus) {
          await prisma.$executeRawUnsafe(
            'UPDATE "Application" SET "resumeStatus" = $1, "updatedAt" = NOW() WHERE id = $2',
            job.data?.appStatus,
            applicationId
          );
        }
        console.log(`[SUCCESS] Interview finalization persisted for ${applicationId}`);
        // ── 1b. Notify org admins that the interview is complete ──────────────
        if (job.data?.interviewStatus === "COMPLETED") {
          try {
            const appForNotify = await prisma.application.findUnique({
              where: { id: applicationId },
              select: {
                fullName: true,
                drive: {
                  select: {
                    title: true,
                    orgId: true,
                    organization: { select: { name: true } },
                  },
                },
                interview: { select: { completedAt: true } },
              },
            });
            const notifyOrgId = appForNotify?.drive?.orgId;
            if (notifyOrgId) {
              const admins = await prisma.user.findMany({
                where: { orgId: notifyOrgId, role: "ADMIN" },
                select: { email: true, name: true },
              });
              const { sendInterviewCompletedEmail } = await import('./lib/mail');
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sreevaai.com';
              const reportLink = `${appUrl}/admin/candidates/${applicationId}`;
              await Promise.allSettled(
                admins.map(admin =>
                  sendInterviewCompletedEmail({
                    adminEmail: admin.email,
                    candidateName: appForNotify?.fullName || "Candidate",
                    jobTitle: appForNotify?.drive?.title || "Unknown Role",
                    orgName: appForNotify?.drive?.organization?.name || "Sreeva AI",
                    driveTitle: appForNotify?.drive?.title,
                    completedAt: appForNotify?.interview?.completedAt ?? undefined,
                    reportLink,
                  })
                )
              );
              console.log(`[MAIL] Interview completed notifications sent to ${admins.length} admin(s) for ${applicationId}`);
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
          fullName: true,
          drive: {
            select: {
              orgId: true,
              title: true,
              role: true,
            },
          },
        },
      });
      const orgId = String(application?.drive?.orgId || "");
      const recordingSettings = orgId
        ? await getOrgRecordingSettings(orgId)
        : { recordingEnabled: false, recordingRetentionDays: null };
      const interviewRow = await prisma.interview.findUnique({
        where: { applicationId },
        select: {
          recording: true,
        },
      });
      const existingRecording = normalizeRecordingState(interviewRow?.recording);
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
      const recordingName = [application?.fullName, application?.drive?.title || application?.drive?.role]
        .filter(Boolean)
        .join(" ") || applicationId;
      const recordingToPersist = mergeRecordingState(interviewRow?.recording, {
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
         SET "interviewDuration" = CASE WHEN $1::integer IS NOT NULL THEN $1::integer ELSE "interviewDuration" END,
             "recording" = $2::jsonb,
             "updatedAt" = NOW()
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
            fullName: true,
            drive: { select: { title: true, organization: { select: { slug: true } } } },
          },
        });
        // 3. Resolve Folder & Key
        const orgSlug = application?.drive?.organization?.slug || "unknown-org";
        const driveTitle = (application?.drive?.title || "unknown-job").replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const candName = (application?.fullName || candidateName || applicationId)
          .replace(/[^a-zA-Z0-9_\- ]/g, "")
          .trim()
          .replace(/\s+/g, "_")
          .toLowerCase();
        const timestamp = Date.now();
        const snapshotLabel = label || "snapshot";
        const key = `interview/${orgSlug}/${driveTitle}/${candName}/snapshots/${snapshotLabel}_${timestamp}.jpg`;
        const bucket = process.env.R2_INTERVIEW_BUCKET || "interview";
        // 4. Upload to R2
        const url = await putObject(bucket, key, buffer, "image/jpeg");
        // 5. Update Database (Atomic Push)
        const appForSnapshot = await prisma.application.findUnique({
          where: { id: String(applicationId) },
          select: { id: true, fullName: true }
        });
        if (!appForSnapshot) {
          console.warn(`[SKIP] Application ${applicationId} not found. Candidate may have been deleted.`);
          return { skipped: true };
        }
        await prisma.interview.upsert({
          where: { applicationId: String(applicationId) },
          update: {
            snapshots: {
              push: url
            }
          },
          create: {
            id: generateId("int", appForSnapshot?.fullName || String(applicationId)),
            applicationId: String(applicationId),
            accessToken: crypto.randomUUID(),
            snapshots: [url],
            status: "PENDING"
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
      const { bucket, key, buffer, contentType } = job.data;
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
  });
}

console.log("[Worker] Started. Listening for enabled queues.");
/**
}
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
