import 'dotenv/config'; // must be FIRST — ensures .env is loaded before any lib reads process.env
import { Worker, Queue } from 'bullmq';
import crypto from 'crypto';
import { join } from 'path';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { writeFile, unlink, readdir, stat } from 'fs/promises';
import { prisma } from './lib/prisma';
import redisConnection, { createRedisConnection } from './lib/redis';
import { putObject, getObjectBuffer, headObjectStrict } from "./lib/s3";
import { generateId } from "./lib/ids";
import { isInterviewTokenRequired } from "./lib/interview-access";
import { appendCandidateActivity } from "./lib/candidate-activity";
import { getPythonExecutable } from "./lib/python-exec";
import { extractJDFromText } from "./lib/openai";
import { parseDriveScreeningSettings } from "./lib/screening-criteria";
import { recordOrgBillingUsage } from "./lib/usage-metrics";
import { buildInterviewLink } from "./lib/interview-links";
import { safeFetch } from "./lib/safe-fetch";
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
// Silence BullMQ's built-in eviction-policy warning.
// BullMQ internally logs "IMPORTANT! Eviction policy is volatile-lru" on every
// queue/worker connection check. We handle this ourselves, so we suppress it.
const _origLog = console.log.bind(console);
console.log = (...args: any[]) => {
  const first = typeof args[0] === 'string' ? args[0] : "";
  if (first.includes('IMPORTANT! Eviction policy')) return;
  _origLog(...args);
};
const _origWarn = console.warn.bind(console);
console.warn = (...args: any[]) => {
  const first = typeof args[0] === 'string' ? args[0] : "";
  if (first.includes('IMPORTANT! Eviction policy')) return;
  if (first.includes('Running queue cleanup to free memory')) return;
  if (first.includes('Could not set Redis eviction policy')) {
    const detail = String(args[0]).split(':').slice(1).join(':').trim();
    _origWarn(`[Worker] Could not set Redis eviction policy${detail ? `: ${detail}` : ""}`);
    return;
  }
  if (first.includes('Cron registration skipped')) {
    _origWarn("[Worker] Cron registration skipped because Redis is near its memory limit.");
    return;
  }
  _origWarn(...args);
};
const _origError = console.error.bind(console);
console.error = (...args: any[]) => {
  const first = typeof args[0] === 'string' ? args[0] : "";
  if (first.includes('Failed to register backup job')) {
    _origError("[Worker] Failed to register backup job:", ...args.slice(1));
    return;
  }
  if (first.includes('Failed to register recording retention sweep')) {
    _origError("[Worker] Failed to register recording retention sweep:", ...args.slice(1));
    return;
  }
  _origError(...args);
};
if (!process.env.REDIS_URL) {
  console.error('FATAL: REDIS_URL is missing from environment variables!');
  process.exit(1);
}
void redisConnection.connect().catch(() => {}); // force-connect before BullMQ workers start
const pythonCmd = getPythonExecutable();
const DEFAULT_R2_PUBLIC_URL = "https://pub-e4a8b24775c741f6a650def856cfec9f.r2.dev";
function parseJsonSafe<T = Record<string, any>>(raw: unknown, fallback: T): T {
  try {
    if (!raw) return fallback;
    if (typeof raw === "string") return JSON.parse(raw) as T;
    if (typeof raw === "object") return raw as T;
    return fallback;
  } catch {
    return fallback;
  }
}
function hasJdMustHaves(jd: Record<string, any>): boolean {
  if (Array.isArray(jd?.criteria) && jd.criteria.length > 0) return true;
  const mustHave = jd?.skills?.must_have;
  return Array.isArray(mustHave) && mustHave.length > 0;
}
function buildJdRawText(drive: {
  title?: string | null;
  role?: string | null;
  extractedDetails?: string | null;
}) {
  const parts: string[] = [];
  if (drive.title?.trim()) parts.push(`Title: ${drive.title.trim()}`);
  if (drive.role?.trim()) parts.push(`Role: ${drive.role.trim()}`);
  try {
    const ex = drive.extractedDetails ? JSON.parse(drive.extractedDetails) : {};
    if (ex.role_summary?.trim()) parts.push(ex.role_summary.trim());
    if (Array.isArray(ex.responsibilities) && ex.responsibilities.length > 0)
      parts.push(`Responsibilities:\n${ex.responsibilities.join("\n")}`);
    if (Array.isArray(ex.requirements) && ex.requirements.length > 0)
      parts.push(`Requirements:\n${ex.requirements.join("\n")}`);
    const mustHave = Array.isArray(ex.skills?.must_have)
      ? ex.skills.must_have.map((s: any) => (typeof s === "object" ? s.skill : s)).filter(Boolean)
      : [];
    if (mustHave.length > 0) parts.push(`Skills:\n${mustHave.join(", ")}`);
    const minExp = ex.experience?.min_years;
    const maxExp = ex.experience?.max_years;
    if (typeof minExp === "number") parts.push(`Experience: ${minExp}${maxExp ? `-${maxExp}` : "+"}+ years`);
  } catch { /* ignore parse errors */ }
  return parts.join("\n\n").trim();
}
// Core spawn runner with hard timeout + guaranteed slot release. `stdinPayload`
// optional. On timeout the process is SIGKILLed so it can't linger.
function spawnPythonJson(args: string[], stdinPayload: string | null, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    let settled = false;
    const p = spawn(pythonCmd, args);
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    const timer = setTimeout(() => {
      try { p.kill("SIGKILL"); } catch { /* already dead */ }
      finish(() => reject(new Error(`python timed out after ${timeoutMs}ms`)));
    }, timeoutMs);
    p.stdout.on("data", (data) => { out += data.toString(); });
    p.stderr.on("data", (data) => { err += data.toString(); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish(() => reject(new Error(err || `python exited ${code}`)));
        return;
      }
      try {
        const parsed = JSON.parse(out);
        finish(() => resolve(parsed));
      } catch (e: any) {
        finish(() => reject(new Error(`Invalid python JSON: ${e.message}`)));
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
          await unlink(full).catch(() => {});
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
async function setDriveCandidateStage(
  applicationId: string,
  stage: string,
  progress: number,
  resumeStatus: string,
) {
  const payload = JSON.stringify({ processing: { stage, progress } });
  await prisma.application.update({
    where: { id: applicationId },
    data: { resumeStatus, aiScore: progress, aiReport: payload },
  }).catch((err: any) => {
    console.warn(`  [RESUME] stage update failed appId=${applicationId}: ${err?.message}`);
  });
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
    }).catch(() => {});
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
    }).catch(() => {});
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
      }).catch(() => {});
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
async function processDriveResumeBatchJob(job: any) {
  const { driveId, orgId, candidateIds: candidateIdsFromPayload } = job.data || {};
  if (!driveId || !orgId) {
    console.warn(`[WORKER] Stale job ${job.id} has no payload — discarding.`);
    return;
  }
  const batchExtractModel = "gpt-4o-mini";
  const batchReportModel = "gpt-4o-mini";
  console.log(`\n[RESUME JOB] jobId=${job.id} driveId=${driveId} candidates=${Array.isArray(candidateIdsFromPayload) ? candidateIdsFromPayload.length : 0}`);
  if (!Array.isArray(candidateIdsFromPayload) || candidateIdsFromPayload.length === 0) {
    console.warn(`[RESUME JOB] ${job.id} has no candidateIds — discarding.`);
    return;
  }
  let candidates = await prisma.application.findMany({
    where: { id: { in: candidateIdsFromPayload } },
    orderBy: { createdAt: "asc" },
  });
  if (candidates.length === 0) {
    console.warn(`[RESUME JOB] ${job.id} candidates deleted — exiting cleanly.`);
    return;
  }
  console.log(`[RESUME JOB] ${job.id} → processing ${candidates.length} resume(s) in parallel`);
  const drive = await prisma.drive.findUnique({
    where: { id: driveId },
    select: {
      extractedDetails: true,
      role: true,
      title: true,
      screeningThreshold: true,
      screeningCriteria: true,
    },
  });
  if (!drive) throw new Error(`Drive ${driveId} not found`);
  const parsedSettings = parseDriveScreeningSettings(
    drive.screeningCriteria,
    Number(drive.screeningThreshold ?? 60)
  );
  const threshold = parsedSettings.threshold;
  const screeningCriteria = parsedSettings.criteria;
  let structuredJd = parseJsonSafe<Record<string, any>>(drive.extractedDetails, {});
  const jdRawText = buildJdRawText(drive);
  if (!hasJdMustHaves(structuredJd) && jdRawText.length >= 80) {
    try {
      const extracted = await extractJDFromText(jdRawText, "gpt-4o-mini");
      if (hasJdMustHaves(extracted.data || {})) {
        structuredJd = extracted.data || {};
        await prisma.drive.update({
          where: { id: driveId },
          data: { extractedDetails: JSON.stringify(structuredJd) },
        }).catch(() => {});
        if ((extracted.usage?.inputTokens || extracted.usage?.outputTokens)) {
          await recordOrgBillingUsage({
            orgId,
            feature: "jdExtraction",
            usage: { ...extracted.usage, eventId: `resume-jd:${job.id}:${driveId}` },
          }).catch(() => {});
        }
      }
    } catch (jdErr: any) {
      console.warn(`[RESUME JOB] ${job.id} JD extraction failed, scoring without JD — ${jdErr?.message}`);
    }
  }
  await Promise.allSettled(
    candidates.map(async (candidate) => {
        let tmpPdfPath: string | null = null;
        const appId = candidate.id; // candidate IS the Application row now
        try {
          const existingStatus = String(candidate.resumeStatus || "").toLowerCase();
          const existingReport = String(candidate.aiReport || "");
          const existingReportJson = parseJsonSafe<any>(candidate.aiReport, {});
          const existingStage = String(existingReportJson?.processing?.stage || "").toLowerCase();
          const alreadyCompleted =
            (existingStatus === "shortlisted" || existingStatus === "rejected") &&
            existingReport.includes("\"stage\":\"completed\"");
          const alreadyFailed = existingStatus === "failed" && existingStage === "failed";
          if (alreadyCompleted || alreadyFailed) {
            return;
          }
          const source = parseJsonSafe<any>(candidate.resumeData, {}).source || {};
          const bucket = String(source.bucket || process.env.R2_RESUMES_BUCKET || "resumes");
          const key = String(source.key || "");
          if (!key) throw new Error(`Missing source key for application ${appId}`);
          await setDriveCandidateStage(appId, "starting", 10, "starting");
          // Download PDF from R2 — fast-fail if key was deleted
          let pdfBuffer: Buffer;
          try {
            pdfBuffer = await getObjectBuffer(bucket, key);
          } catch (r2Err: any) {
            const msg = String((r2Err as any)?.message || r2Err || '');
            if (msg.includes('does not exist') || msg.includes('NoSuchKey') || msg.includes('404') || msg.includes('specified key')) {
              console.error(`[RESUME-WORKER] R2 key missing for candidate ${candidate.id}: ${key}`);
              throw Object.assign(new Error(`R2 key no longer exists: ${key}`), { noRetry: true });
            }
            throw r2Err;
          }
          tmpPdfPath = join(tmpdir(), `drive_resume_${candidate.id}_${Date.now()}.pdf`);
          await writeFile(tmpPdfPath, pdfBuffer);
          // Use cached parse result if already stored — avoids LLM non-determinism on retries
          const cachedResumeData = parseJsonSafe<any>(candidate.resumeData, {});
          const cachedStructured = cachedResumeData?.structured || {};
          const cachedText = String(candidate.resumeText || "");
          const hasCachedParse = cachedText.length > 50 && Object.keys(cachedStructured).length > 0;
          let resumeRawText: string;
          let structuredResume: Record<string, any>;
          let aiResult: Record<string, any>;
          let scoreUsage: Record<string, any> | null = null;
          await setDriveCandidateStage(appId, "extracting", 50, "extracting");
          if (hasCachedParse) {
            // Already have parsed resume — only need to score it (single subprocess)
            console.log(`  [RESUME] ${candidate.fullName} — cached parse found, scoring only`);
            const tmpScorePath = join(tmpdir(), `drive_score_${candidate.id}_${Date.now()}.json`);
            await writeFile(tmpScorePath, JSON.stringify({
              resume: cachedStructured,
              jd: structuredJd,
              resume_raw_text: cachedText,
              jd_raw_text: jdRawText,
              threshold,
              screening_criteria: screeningCriteria,
            }));
            const scoreOnly = await runPythonJson(["scripts/extract_pdf.py", tmpScorePath, "SCORE", batchReportModel]);
            await unlink(tmpScorePath).catch(() => {});
            if (scoreOnly?.error) throw new Error(scoreOnly.error);
            resumeRawText = cachedText;
            structuredResume = cachedStructured;
            aiResult = scoreOnly.data || scoreOnly;
            scoreUsage = scoreOnly.usage || null;
          } else {
            // Combined mode: one subprocess does extract + parse + score + report
            console.log(`  [RESUME] ${candidate.fullName} — extracting + scoring`);
            const jdPayload = JSON.stringify({
              jd: structuredJd,
              jd_raw_text: jdRawText,
              threshold,
              screening_criteria: screeningCriteria,
            });
            const combined = await runPythonJsonWithStdin(
              ["scripts/extract_pdf.py", tmpPdfPath, "RESUME_AND_SCORE", batchExtractModel, batchReportModel],
              jdPayload,
            );
            if (combined?.error) throw new Error(combined.error);
            resumeRawText = String(combined?.text || "");
            structuredResume = combined?.data || {};
            aiResult = combined?.score || {};
            scoreUsage = combined?.usage_score || null;
            // Bill extraction usage separately
            const usageExtract = combined?.usage_extract || {};
            if (usageExtract?.inputTokens || usageExtract?.outputTokens) {
              await recordOrgBillingUsage({
                orgId,
                feature: "resumeExtraction",
                usage: {
                  model: usageExtract.model,
                  inputTokens: usageExtract.inputTokens || 0,
                  outputTokens: usageExtract.outputTokens || 0,
                  cachedInputTokens: usageExtract.cachedInputTokens || 0,
                  eventId: `resume-extraction:${candidate.id}`,
                },
              });
            }
          }
          await setDriveCandidateStage(appId, "scoring", 90, "scoring");
          const finalScore =
            typeof aiResult.score === "number"
              ? aiResult.score
              : parseInt(String(aiResult.score || "0"), 10) || 0;
          const finalStatus = finalScore >= threshold ? "shortlisted" : "rejected";
          const completedPayload = JSON.stringify({
            processing: { stage: "completed", progress: 100 },
            result: { score: finalScore, status: finalStatus },
          });
          const fullScanPayload = JSON.stringify({
            ...aiResult,
            score: finalScore,
            status: finalStatus,
          });
          await prisma.application.update({
            where: { id: appId },
            data: {
              fullName: structuredResume?.full_name || candidate.fullName,
              email: structuredResume?.email || "",
              phone: structuredResume?.phone || "",
              resumeText: resumeRawText,
              resumeData: JSON.stringify(structuredResume),
              aiScore: finalScore,
              aiReport: completedPayload,
              fullScanReport: fullScanPayload,
              resumeStatus: finalStatus,
              interviewStatus: "pending",
              hiringStatus: "pending",
            },
          }).catch((err: unknown) => {
            console.warn(`  [RESUME] ${candidate.fullName} — final update failed: ${(err as Error)?.message}`);
          });
          await appendCandidateActivity(appId, {
            type: "resume_screened",
            label: finalStatus === "shortlisted" ? "Resume shortlisted" : "Resume rejected",
            details: `AI score ${finalScore} vs threshold ${threshold}`,
            timestamp: new Date().toISOString(),
            source: "system",
          }).catch(() => {});
          console.log(`  [RESUME] ${candidate.fullName} — score=${finalScore} → ${finalStatus.toUpperCase()}`);

          if (scoreUsage?.inputTokens || scoreUsage?.outputTokens) {
            await recordOrgBillingUsage({
              orgId,
              feature: "resumeReport",
              usage: {
                model: scoreUsage.model,
                inputTokens: scoreUsage.inputTokens || 0,
                outputTokens: scoreUsage.outputTokens || 0,
                cachedInputTokens: scoreUsage.cachedInputTokens || 0,
                eventId: `resume-report:${appId}`,
              },
            });
          }
        } catch (error: any) {
          const failPayload = JSON.stringify({
            processing: {
              stage: "failed",
              progress: 100,
              error: error?.message || "Resume processing failed",
            },
          });
          console.error(`  [RESUME] ${candidate.fullName} — FAILED: ${error?.message || error}`);
          await prisma.application.update({
            where: { id: appId },
            data: { resumeStatus: "failed", aiScore: 0, aiReport: failPayload },
          }).catch(() => {});
        } finally {
          if (tmpPdfPath) await unlink(tmpPdfPath).catch(() => {});
        }
      })
  );
  console.log(`[RESUME JOB] ${job.id} done — all ${candidates.length} resume(s) processed\n`);
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
async function waitForInterviewTranscript(
  applicationId: string,
  initialTranscript: string,
  retries = 6,
  delayMs = 2000
): Promise<string> {
  if (initialTranscript.trim()) return initialTranscript.trim();
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const row = await prisma.interview.findUnique({
      where: { applicationId },
      select: { interviewTranscript: true },
    });
    const transcript = String(row?.interviewTranscript || "").trim();
    if (transcript) {
      console.log(`[REPORT] Transcript became available for ${applicationId} on retry ${attempt}/${retries}`);
      return transcript;
    }
  }
  return "";
}
const managedWorkers: Worker[] = [];
let backupQueue: Queue | null = null;
let shutdownInProgress = false;
let setupCronJobs: (() => Promise<void>) | null = null;
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
  if (backupQueue) {
    await backupQueue.close().catch((error) => {
      console.warn("[Worker] Failed to close backup queue cleanly:", error);
    });
  }
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
async function processResumeFileExtractJob(job: any) {
  const {
    bucket = process.env.R2_RESUMES_BUCKET || "resumes",
    key,
    fileUrl = null,
    fileName = "resume.pdf",
    orgId = null,
    orgOpenAIModel = "gpt-4o-mini",
  } = job.data || {};
  if (!key) {
    throw new Error("Invalid resume extraction job payload");
  }
  console.log(`[RESUME-WORKER] File extraction job ${job.id} started`, {
    fileName,
    bucket,
    key,
  });
  const tempExt = (() => {
    const match = String(fileName).match(/\.[a-z0-9]+$/i);
    return match?.[0] || ".pdf";
  })();
  const sourceBuffer = await getObjectBuffer(bucket, key);
  const tempFilePath = join(
    tmpdir(),
    `resume_extract_${String(job.id)}_${Date.now()}${tempExt}`
  );
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
    await unlink(tempFilePath).catch(() => {});
  }
}
// Per-org worker factory — each org gets its own BullMQ Worker on its own queue.
// This means Org A's 1000-resume burst never queues behind Org B's jobs.
// Workers are created on demand and cached for the lifetime of the process.
const ORG_REGISTRY_KEY = "resume-worker:active-orgs"; // Redis set — publisher adds orgIds here
const orgWorkers = new Map<string, Worker>();
function getOrCreateOrgWorker(orgId: string): Worker {
  const queueName = `resume-processing--${orgId}`;
  if (orgWorkers.has(queueName)) return orgWorkers.get(queueName)!;
  const w = trackWorker(queueName, new Worker(queueName, async (job) => {
    console.log(`[WORKER:${orgId}] Job picked up → ${job.name} (id=${job.id})`);
    if (job.name === "drive-resume-batch") {
      await processDriveResumeBatchJob(job);
      return;
    }
    if (job.name === "resume-file-extract") {
      return await processResumeFileExtractJob(job);
    }
    console.warn(`[WORKER:${orgId}] Unknown job name: ${job.name} — discarding.`);
  }, {
    connection: redisConnection,
    concurrency: 5,              // 5 sub-jobs per org in parallel — each sub-job runs its candidates all at once
    lockDuration: 15 * 60 * 1000,
    stalledInterval: 60 * 1000,
    maxStalledCount: 3,
    drainDelay: 200,
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 0 },
  }));
  w.on("failed", (job, err) => {
    console.error(`[RESUME-WORKER:${orgId}] Job ${job?.id} failed: ${err.message}`);
  });
  void w.waitUntilReady()
    .then(() => console.log(`[resume-processing--${orgId}] Worker ready`))
    .catch((err) => console.error(`[resume-processing--${orgId}] Worker failed to start:`, err));
  orgWorkers.set(queueName, w);
  return w;
}

// Legacy fallback worker on the shared queue (handles any old jobs still in Redis).
// New uploads go to per-org queues; this only runs until the old queue drains.
if (isQueueEnabled("resume-processing")) {
  const worker = trackWorker('resume-processing', new Worker('resume-processing', async (job) => {
    console.log(`[WORKER:legacy] Job picked up → ${job.name} (id=${job.id})`);
    if (job.name === "drive-resume-batch") {
      await processDriveResumeBatchJob(job);
      return;
    }
    if (job.name === "resume-file-extract") {
      return await processResumeFileExtractJob(job);
    }
    console.warn(`[RESUME-WORKER] Unknown job name: ${job.name} — discarding.`);
  }, {
    connection: redisConnection,
    concurrency: 50, // unlimited effective concurrency — all sub-jobs picked up immediately
    lockDuration: 15 * 60 * 1000, // 15 min — safely exceeds the slowest single chunk
    stalledInterval: 60 * 1000, // Check for stalled jobs every 60s (faster recovery)
    maxStalledCount: 3, // Re-deliver a stalled job up to 3 times before giving up
    drainDelay: 200, // Poll every 200ms for snappier job pickup
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 0 },
  }));
  void worker.waitUntilReady()
    .then(() => console.log("[resume-processing] Worker ready and waiting for jobs"))
    .catch((error) => console.error("[resume-processing] Worker failed to become ready:", error));
  worker.on('failed', (job, err) => {
    console.log(`[FATAL] Job ${job?.id} failed permanently: ${err.message}`);
  });
  // Temp-file janitor: sweep at boot and every 6 hours.
  void sweepTempFiles();
  setInterval(() => { void sweepTempFiles(); }, 6 * 60 * 60 * 1000).unref();
  // Watch Redis for new orgs that have uploaded resumes.
  // The publisher adds each orgId to ORG_REGISTRY_KEY on every enqueue.
  // We poll every 10s and spin up a worker for any org we haven't seen yet.
  async function syncOrgWorkers() {
    try {
      const orgIds = await redisConnection.smembers(ORG_REGISTRY_KEY);
      for (const orgId of orgIds) {
        if (orgId) getOrCreateOrgWorker(orgId);
      }
    } catch (err: any) {
      if (!shutdownInProgress) console.warn("[ORG-WORKERS] Failed to sync org workers:", err?.message);
    }
  }
  void syncOrgWorkers(); // run immediately at boot to restore workers for existing orgs
  const orgSyncInterval = setInterval(() => { void syncOrgWorkers(); }, 10_000);
  orgSyncInterval.unref();
  // Clear the interval on shutdown so it doesn't fire on a closed connection.
  process.once("SIGINT", () => clearInterval(orgSyncInterval));
  process.once("SIGTERM", () => clearInterval(orgSyncInterval));
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
      console.log(`[Invitation Worker] Job received: action=${action}, applicationId=${applicationId}`);
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
        }).catch(() => {});
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
      concurrency: 3,
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
      if (job.name === RECORDING_RETENTION_SWEEP_JOB) {
        return await processRecordingRetentionSweepJob(job);
      }
      console.warn(`[RETENTION] Skipping unsupported job name: ${job.name}`);
      return { skipped: true, reason: "unsupported_job_name" };
    },
    {
      connection: redisConnection,
      concurrency: 2,
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
      if (job.name !== "mark-interview-started") {
        console.warn(`[INTERVIEW-START] Skipping unsupported job name: ${job.name}`);
        return { skipped: true, reason: "unsupported_job_name" };
      }
      return await processInterviewStartJob(job);
    },
    {
      connection: redisConnection,
      concurrency: 2,
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
if (isQueueEnabled("backup-queue")) {
  const backupWorker = trackWorker("backup-queue", new Worker(
    "backup-queue",
    async (job) => {
      console.log(`[Backup Worker] Starting database backup to R2...`);
      try {
        // 1. Fetch data from core tables
        const users = await prisma.user.findMany();
        const drives = await prisma.drive.findMany({
          select: {
            id: true,
            title: true,
            role: true,
            screeningThreshold: true,
            creatorId: true,
            createdAt: true,
            updatedAt: true,
            extractedDetails: true,
            interviewLanguage: true,
            interviewQuestions: true,
            jdFileName: true,
            jdPreviewUrl: true,
            orgId: true,
            location: true,
            aiName: true,
            voiceId: true,
          },
        });
        const applications = await prisma.application.findMany();
        const interviews = await prisma.interview.findMany();
        const backupData = {
          metadata: {
            timestamp: new Date().toISOString(),
            version: "1.0",
          },
          users,
          drives,
          applications,
          interviews,
        };
        // 2. Upload to Cloudflare R2
        const filename = `backups/db_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const buffer = Buffer.from(JSON.stringify(backupData, null, 2));
        await putObject(
          "resumes", // Using the existing resumes bucket, folder 'backups'
          filename,
          buffer,
          "application/json"
        );
        console.log(`[Backup Worker] Backup successful: ${filename}`);
        return { success: true, filename };
      } catch (error) {
        console.error(`[Backup Worker Error]:`, error);
        throw error;
      }
    },
    {
      connection: redisConnection,
      lockDuration: 10 * 60 * 1000,
      stalledInterval: 5 * 60 * 1000, // Check for stalled jobs every 5 min to reduce Redis writes
      maxStalledCount: 1,
      removeOnComplete: { age: 60 },
      removeOnFail: { age: 60 },
    }
  ));
  // Setup Recurring Backup Job (Daily at Midnight)
  backupQueue = new Queue("backup-queue", { connection: redisConnection });
  setupCronJobs = async function setupCronJobs() {
    // Clean up old ones first to avoid duplicates on restart
    const queue = backupQueue;
    if (!queue) {
      throw new Error("Backup queue is not initialized");
    }
    const repeatableJobs = await queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await queue.removeRepeatableByKey(job.key);
    }
    await queue.add(
      "daily-backup",
      {},
      {
        repeat: {
          pattern: "0 0 * * *", // Midnight daily
        },
      }
    );
    console.log("[Worker] Registered recurring daily backup job.");
    await queue.close();
    backupQueue = null;
  };
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
      const { applicationId, recordingUrl, transcript, interviewStatus, appStatus } = job.data || {};
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
        const shouldStoreRecording = Boolean(recordingUrl) && recordingSettings.recordingEnabled;
        const recordingDisabled = Boolean(recordingUrl && !recordingSettings.recordingEnabled);
        const recordingUrlToPersist = shouldStoreRecording ? recordingUrl : undefined;
        if (recordingUrl && !recordingSettings.recordingEnabled) {
          await deleteRecordingAsset({
            recordingUrl,
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
        const incomingTranscript = String(transcript || "").trim();
        if (recordingUrlToPersist) {
          updateData.recording = mergeRecordingState(existingInterview?.recording, {
            status: interviewStatus === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
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
        if (interviewStatus) {
          updateData.status = interviewStatus;
        }
        if (interviewStatus === "COMPLETED") {
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
              status: interviewStatus || "IN_PROGRESS",
              ...updateData,
            },
          });
        } catch {
          await persistInterviewUpdateRaw({
            applicationId,
            recordingUrl: recordingUrlToPersist,
            transcript,
            interviewStatus,
          });
        }
        if (recordingDisabled) {
          console.log(`[FINALIZE] Recording disabled for ${applicationId}; stored disabled state in recording JSON.`);
        }
        if (recordingUrlToPersist && interviewStatus === "COMPLETED") {
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
        if (appStatus) {
          await prisma.$executeRawUnsafe(
            'UPDATE "Application" SET "resumeStatus" = $1, "updatedAt" = NOW() WHERE id = $2',
            appStatus,
            applicationId
          );
        }
        console.log(`[SUCCESS] Interview finalization persisted for ${applicationId}`);
        // ── 1b. Notify org admins that the interview is complete ──────────────
        if (interviewStatus === "COMPLETED") {
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
                    adminName: admin.name || "Admin",
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
        // ── 2. Generate AI interview report (no timeout — we're in a worker) ──
        try {
          // Fetch all data needed for report generation
          const app = await prisma.application.findUnique({
            where: { id: applicationId },
            select: {
              fullName: true,
              email: true,
              createdAt: true,
              updatedAt: true,
              aiScore: true,
              resumeStatus: true,
              hiringStatus: true,
              resumeText: true,
              aiReport: true,
              drive: { select: { id: true, title: true, orgId: true } },
              interview: {
                select: {
                  interviewTranscript: true,
                  skillRatings: true,
                  scoreBreakdown: true,
                  interviewDuration: true,
                  integritySignals: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          });
          if (!app) {
            console.warn(`[REPORT] Application not found for ${applicationId}, skipping report.`);
            return { success: true };
          }
          const initialTranscript = transcript || app.interview?.interviewTranscript || "";
          const finalTranscript = await waitForInterviewTranscript(applicationId, initialTranscript);
          const createdAtIso = app.createdAt.toISOString();
          const resumeReportCreatedAtIso = app.updatedAt.toISOString();
          const interviewCreatedAtIso = app.interview?.createdAt?.toISOString() || app.interview?.updatedAt?.toISOString() || createdAtIso;
          const existingInterviewReport = app.interview?.scoreBreakdown || null;
          if (!finalTranscript) {
            console.warn(`[REPORT] No transcript available for ${applicationId} after retries; report generation skipped.`);
            return { success: true };
          }
          if (existingInterviewReport) {
            console.log(`[REPORT] Report already exists for ${applicationId}.`);
          }
          console.log(`[REPORT] Interview finalization complete for ${applicationId}`);
        } catch (reportError) {
          // Report failure must NOT fail the job — transcript/recording is already safe
          console.error(`[REPORT] Failed to generate report for ${applicationId}:`, reportError);
        }
        return { success: true };
      } catch (error) {
        console.error(`[Interview Finalization Worker Error]:`, error);
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: 2,
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
      if (job.name !== "finalize-egress-recording") {
        console.warn(`[RECORDING_WORKER] Skipping unsupported job name: ${job.name}`);
        return { skipped: true, reason: "unsupported_job_name" };
      }
      const {
        applicationId,
        egressId,
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
      const finalizationQueue = new Queue("interview-finalization", { connection: redisConnection });
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
      concurrency: 2,
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
      concurrency: 5, // Process snapshots in parallel to clear Redis memory fast
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
      concurrency: 5, // Efficient parallel uploads
      removeOnComplete: { age: 60 },
      removeOnFail: { age: 60 },
    }
  ));
  jdUploadWorker.on("failed", (job, err) => {
    console.log(`[FATAL] JD Upload Job ${job?.id} failed: ${err.message}`);
  });
}
/**
 * JD EXTRACTION WORKER
 * Extracts structured JD data from uploaded files, scraped URLs, or raw text.
 */
if (isQueueEnabled("jd-extraction")) {
  const jdExtractionWorker = trackWorker("jd-extraction", new Worker(
    "jd-extraction",
    async (job) => {
      const { kind, orgOpenAIModel = "gpt-4.1-mini" } = job.data || {};
      console.log(`[JD-EXTRACTION] Job ${job.id} started`, { kind, model: orgOpenAIModel });
      if (kind === "text") {
        const { text } = job.data as { text: string };
        if (!text || !text.trim()) {
          throw new Error("Missing JD text for extraction");
        }
        console.log(`[JD-EXTRACTION] Job ${job.id} extracting JD from plain text`);
        const result = await extractJDFromText(text, orgOpenAIModel);
        console.log(`[JD-EXTRACTION] Job ${job.id} completed text extraction`);
        return result;
      }
      if (kind === "url") {
        const { url } = job.data as { url: string };
        if (!url) {
          throw new Error("Missing JD URL for extraction");
        }
        console.log(`[JD-EXTRACTION] Job ${job.id} fetching JD URL`, { url });
        const { load } = await import("cheerio");
        const response = await safeFetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch JD URL: ${response.statusText}`);
        }
        const html = await response.text();
        const $ = load(html);
        $("script, style, nav, footer, header, noscript, iframe").remove();
        const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 15000);
        console.log(`[JD-EXTRACTION] Job ${job.id} extracted URL text, sending to OpenAI`);
        const result = await extractJDFromText(text, orgOpenAIModel);
        console.log(`[JD-EXTRACTION] Job ${job.id} completed URL extraction`);
        return result;
      }
      if (kind === "file") {
        const { buffer, fileName } = job.data as {
          buffer: Buffer | { type?: string; data?: number[] };
          fileName: string;
        };
        if (!buffer || !fileName) {
          throw new Error("Missing JD file for extraction");
        }
        const fileBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer.data || []);
        const tempFilePath = join(
          tmpdir(),
          `jd_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, "_")}`
        );
        await writeFile(tempFilePath, fileBuffer);
        try {
          console.log(`[JD-EXTRACTION] Job ${job.id} extracting JD from file`, {
            fileName,
            tempFilePath,
          });
          const pythonProcess = spawn(pythonCmd, [
            "scripts/extract_pdf.py",
            tempFilePath,
            "JD",
            orgOpenAIModel,
          ]);
          let outputData = "";
          let errorData = "";
          await new Promise<void>((resolve, reject) => {
            pythonProcess.stdout.on("data", (data) => {
              outputData += data.toString();
            });
            pythonProcess.stderr.on("data", (data) => {
              errorData += data.toString();
            });
            pythonProcess.on("close", (code) => {
              if (code !== 0) reject(new Error(`JD extraction failed code ${code}: ${errorData}`));
              else resolve();
            });
          });
          console.log(`[JD-EXTRACTION] Job ${job.id} completed file extraction`);
          const parsed = JSON.parse(outputData);
          if (parsed?.error) {
            throw new Error(parsed.error);
          }
          return {
            data: parsed.data || {},
            text: parsed.text || "",
            usage: parsed.usage || {},
          };
        } finally {
          await unlink(tempFilePath).catch(() => { });
        }
      }
      throw new Error(`Unsupported JD extraction job kind: ${String(kind)}`);
    },
    {
      connection: redisConnection,
      concurrency: 1,
      lockDuration: 10 * 60 * 1000,
      removeOnComplete: { age: 60 },
      removeOnFail: { age: 60 },
    }
  ));
  jdExtractionWorker.on("failed", (job, err) => {
    console.log(`[FATAL] JD Extraction Job ${job?.id} failed: ${err.message}`);
  });
}
console.log("[Worker] Started. Listening for enabled queues.");
/**
 * ðŸ§¹ REDIS QUEUE PURGE
 * Aggressively cleans all BullMQ queue data on startup.
 * This is necessary when using a memory-limited managed Redis instance
 * (e.g. Redis Cloud free tier) that cannot change the eviction policy.
 */
const ALL_QUEUE_NAMES = [
  "resume-processing",
  "interview-finalization",
  "interview-snapshots",
  "jd-upload",
  "backup-queue",
  "recording-retention-cleanup",
];
async function purgeAllQueues() {
  console.log("[Worker] Cleaning Redis queues to free memory...");
  try {
    let cursor = "0";
    let deletedCount = 0;
    do {
      const [nextCursor, keys] = await redisConnection.scan(
        cursor, "MATCH", "bull:*", "COUNT", 500
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await redisConnection.del(...keys);
        deletedCount += keys.length;
      }
    } while (cursor !== "0");
    if (deletedCount > 0) {
      console.log(`[Worker] Deleted ${deletedCount} orphaned BullMQ key(s).`);
    } else {
      console.log("[Worker] Redis queues are clean.");
    }
  } catch (err: any) {
    console.warn(`[Worker] Could not purge Redis keys: ${err.message}`);
  }
  // Report memory after cleanup
  const { usedMemory, maxMemory } = await getRedisMemoryStatus();
  if (usedMemory && maxMemory && maxMemory > 0) {
    const pct = Math.round((usedMemory / maxMemory) * 100);
    console.log(
      `[Worker] Redis after cleanup: ${formatBytes(usedMemory)} / ${formatBytes(maxMemory)} (${pct}%)`
    );
    if (pct >= 90) {
      console.warn(
        `[Worker] Redis still at ${pct}% after cleanup; consider upgrading your Redis plan.`
      );
    }
  }
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
    // Removed destructive purgeAllQueues() which deletes pending user uploads on restart
    // await purgeAllQueues();
    if (await shouldSkipCronRegistration()) {
      console.warn("Cron registration skipped because Redis is still near its memory limit.");
      return;
    }
    if (setupCronJobs) {
      try {
        await setupCronJobs();
      } catch (cronErr: any) {
        console.error("  ?? ?? Failed to register backup job (Redis memory may be full):", cronErr.message);
      }
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
