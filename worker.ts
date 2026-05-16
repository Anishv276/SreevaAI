import { Worker, Queue } from 'bullmq';
import { join } from 'path';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { writeFile, unlink } from 'fs/promises';
import { prisma } from './lib/prisma';
import redisConnection from './lib/redis';
import * as dotenv from 'dotenv';
import { putObject } from "./lib/s3";
import { getObjectBuffer } from "./lib/s3";
import { generateId } from "./lib/ids";
import { isInterviewTokenRequired } from "./lib/interview-access";
import { appendCandidateActivity } from "./lib/candidate-activity";
import { getPythonExecutable } from "./lib/python-exec";
import { extractJDFromText } from "./lib/openai";
import { deriveDriveJdFieldsFromDescription } from "./lib/drive-jd";
import { parseDriveScreeningSettings } from "./lib/screening-criteria";
import { recordOrgBillingUsage } from "./lib/usage-metrics";
// Load environment variables
dotenv.config();
console.log('DEBUG: REDIS_URL length:', process.env.REDIS_URL?.length || 0);
// â”€â”€â”€ Silence BullMQ's built-in eviction-policy warning â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BullMQ internally logs "IMPORTANT! Eviction policy is volatile-lru" on every
// queue/worker connection check. We handle this ourselves, so we suppress it.
const _origLog = console.log.bind(console);
console.log = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('IMPORTANT! Eviction policy')) return;
  _origLog(...args);
};
const _origWarn = console.warn.bind(console);
console.warn = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('IMPORTANT! Eviction policy')) return;
  _origWarn(...args);
};
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (!process.env.REDIS_URL) {
  console.error('â Œ FATAL: REDIS_URL is missing from environment variables!');
  process.exit(1);
}
void redisConnection.connect().catch(() => {}); // force-connect before BullMQ workers start
const pythonCmd = getPythonExecutable();

const DRIVE_BATCH_SIZE = 5;

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
  description?: string | null;
  responsibilities?: string | null;
  requirements?: string | null;
  skills?: string | null;
  experience?: string | null;
}) {
  const parts: string[] = [];
  if (drive.title?.trim()) parts.push(`Title: ${drive.title.trim()}`);
  if (drive.role?.trim()) parts.push(`Role: ${drive.role.trim()}`);
  if (drive.description?.trim()) parts.push(drive.description.trim());
  if (drive.responsibilities?.trim()) parts.push(`Responsibilities:\n${drive.responsibilities.trim()}`);
  if (drive.requirements?.trim()) parts.push(`Requirements:\n${drive.requirements.trim()}`);
  if (drive.skills?.trim()) parts.push(`Skills:\n${drive.skills.trim()}`);
  if (drive.experience?.trim()) parts.push(`Experience:\n${drive.experience.trim()}`);
  return parts.join("\n\n").trim();
}

async function runPythonJson(args: string[], timeoutMs = 180000): Promise<any> {
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    const p = spawn(pythonCmd, args);
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error(`python timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    p.stdout.on("data", (data) => { out += data.toString(); });
    p.stderr.on("data", (data) => { err += data.toString(); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(err || `python exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch (e: any) {
        reject(new Error(`Invalid python JSON: ${e.message}`));
      }
    });
    p.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function setDriveCandidateStage(
  candidateId: string,
  stage: string,
  progress: number,
  resumeStatus: string
) {
  const payload = JSON.stringify({ processing: { stage, progress } });

  // Always update ResumeCandidates first (never fails)
  await prisma.resumeCandidate.update({
    where: { id: candidateId },
    data: { resumeStatus, aiScore: progress, aiReport: payload },
  });

  // Find linked Application. Upload API stores candidateId inside resumeData JSON.
  // Search both resumeUrl and resumeData to be resilient across all upload flows.
  let app: { id: string } | null = null;
  try {
    app = await prisma.application.findFirst({
      where: {
        OR: [
          { resumeUrl: { contains: candidateId } },
          { resumeData: { contains: candidateId } },
        ],
      },
      select: { id: true },
    });
  } catch {
    // Ignore lookup errors — ResumeCandidates is already updated above.
  }

  if (app?.id) {
    await prisma.application.update({
      where: { id: app.id },
      data: { resumeStatus, aiScore: progress, aiReport: payload },
    });
  }
}
async function processDriveResumeBatchJob(job: any) {
  const { batchId, driveId, orgId } = job.data || {};
  if (!batchId || !driveId || !orgId) {
    throw new Error("Invalid drive batch job payload");
  }

  console.log(`[RESUME-WORKER] Batch queued -> starting batchId=${batchId} driveId=${driveId}`);

  const batch = await prisma.resumeBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error(`Batch ${batchId} not found`);

  // Idempotency guard: if this batch already finished, don't process it again.
  if (String(batch.status || "").toUpperCase() === "COMPLETED") {
    console.log(`[RESUME-WORKER] Batch ${batchId} is already COMPLETED. Skipping duplicate job run.`);
    return;
  }

  await prisma.resumeBatch.update({
    where: { id: batchId },
    data: { status: "PROCESSING", processedCount: 0, failedCount: 0 },
  });

  const drive = await prisma.drive.findUnique({
    where: { id: driveId },
    select: {
      extractedDetails: true,
      description: true,
      responsibilities: true,
      requirements: true,
      skills: true,
      experience: true,
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
    const extracted = await extractJDFromText(jdRawText, "gpt-5.4-mini");
    if (hasJdMustHaves(extracted.data || {})) {
      structuredJd = extracted.data || {};
      const derivedFields = await deriveDriveJdFieldsFromDescription(jdRawText);
      await prisma.drive.update({
        where: { id: driveId },
        data: {
          extractedDetails: JSON.stringify(structuredJd),
          ...(derivedFields?.skills && !drive.skills?.trim() ? { skills: derivedFields.skills } : {}),
          ...(derivedFields?.responsibilities && !drive.responsibilities?.trim() ? { responsibilities: derivedFields.responsibilities } : {}),
        },
      }).catch(() => {});
      if ((extracted.usage?.inputTokens || extracted.usage?.outputTokens)) {
        await recordOrgBillingUsage({
          orgId,
          feature: "resumeExtraction",
          usage: extracted.usage,
        }).catch(() => {});
      }
    }
  }

  const candidates = await prisma.resumeCandidate.findMany({
    where: { bulkBatchId: batchId },
    orderBy: { createdAt: "asc" },
  });

  console.log(`[RESUME-WORKER] Batch ${batchId}: ${candidates.length} candidate(s) loaded`);

  let processedCount = 0;
  let failedCount = 0;
  const totalChunks = Math.max(1, Math.ceil(candidates.length / DRIVE_BATCH_SIZE));

  for (let i = 0; i < candidates.length; i += DRIVE_BATCH_SIZE) {
    const chunk = candidates.slice(i, i + DRIVE_BATCH_SIZE);
    const chunkIndex = Math.floor(i / DRIVE_BATCH_SIZE) + 1;
    console.log(
      `[RESUME-WORKER] Batch ${batchId}: processing chunk ${chunkIndex}/${totalChunks} ` +
      `(${chunk.length} resume(s))`
    );
    const results = await Promise.allSettled(
      chunk.map(async (candidate) => {
        let tmpPdfPath: string | null = null;
        try {
          const existingStatus = String(candidate.resumeStatus || "").toLowerCase();
          const existingReport = String(candidate.aiReport || "");
          const alreadyCompleted =
            (existingStatus === "shortlisted" || existingStatus === "rejected") &&
            existingReport.includes("\"stage\":\"completed\"");
          if (alreadyCompleted) {
            console.log(
              `[RESUME-WORKER] Candidate ${candidate.id}: already completed in a prior run, skipping.`
            );
            return;
          }

          console.log(`[RESUME-WORKER] Candidate ${candidate.id}: waiting -> extracting (25%)`);
          const source = parseJsonSafe<any>(candidate.resumeData, {}).source || {};
          const bucket = String(source.bucket || process.env.R2_RESUMES_BUCKET || "resumes");
          const key = String(source.key || "");
          if (!key) throw new Error(`Missing source key for candidate ${candidate.id}`);

          await setDriveCandidateStage(candidate.id, "extracting", 25, "processing");

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

          if (hasCachedParse) {
            console.log(`[RESUME-WORKER] Candidate ${candidate.id}: using cached parse result, skipping LLM extraction`);
            resumeRawText = cachedText;
            structuredResume = cachedStructured;
          } else {
            const extracted = await runPythonJson(["scripts/extract_pdf.py", tmpPdfPath, "RESUME", "gpt-5.4-mini"]);
            if (extracted?.error) throw new Error(extracted.error);
            resumeRawText = String(extracted?.text || "");
            structuredResume = extracted?.data || {};
            if (extracted?.usage?.inputTokens || extracted?.usage?.outputTokens) {
              await recordOrgBillingUsage({
                orgId,
                feature: "resumeExtraction",
                usage: {
                  model: extracted.usage.model || "gpt-5.4-mini",
                  inputTokens: extracted.usage.inputTokens || 0,
                  outputTokens: extracted.usage.outputTokens || 0,
                  cachedInputTokens: extracted.usage.cachedInputTokens || 0,
                },
              }).catch(() => {});
            }
          }

          console.log(`[RESUME-WORKER] Candidate ${candidate.id}: extracting -> scoring (50%)`);
          await setDriveCandidateStage(candidate.id, "scoring", 50, "processing");

          const tmpScorePath = join(tmpdir(), `drive_score_${candidate.id}_${Date.now()}.json`);
          await writeFile(tmpScorePath, JSON.stringify({
            resume: structuredResume,
            jd: structuredJd,
            resume_raw_text: resumeRawText,
            jd_raw_text: jdRawText,
            threshold,
            screening_criteria: screeningCriteria,
          }));
          const scoreResult = await runPythonJson(["scripts/extract_pdf.py", tmpScorePath, "SCORE", "gpt-4o"]);
          await unlink(tmpScorePath).catch(() => {});
          if (scoreResult?.error) throw new Error(scoreResult.error);

          console.log(`[RESUME-WORKER] Candidate ${candidate.id}: scoring -> finalizing (75%)`);
          await setDriveCandidateStage(candidate.id, "finalizing", 75, "processing");

          const aiResult = scoreResult.data || scoreResult;
          const finalScore =
            typeof aiResult.score === "number"
              ? aiResult.score
              : parseInt(String(aiResult.score || "0"), 10) || 0;
          const finalStatus = finalScore >= threshold ? "shortlisted" : "rejected";
          const app = await prisma.application.findFirst({
            where: {
              OR: [
                { resumeUrl: { contains: candidate.id } },
                { resumeData: { contains: candidate.id } },
              ],
            },
            select: { id: true },
          });

          const completedPayload = JSON.stringify({
            processing: {
              stage: "completed",
              progress: 100,
            },
            result: {
              score: finalScore,
              status: finalStatus,
            },
          });

          await prisma.resumeCandidate.update({
            where: { id: candidate.id },
            data: {
              fullName: structuredResume?.full_name || candidate.fullName,
              email: structuredResume?.email || candidate.email,
              phone: structuredResume?.phone || candidate.phone,
              resumeText: resumeRawText,
              resumeData: JSON.stringify({
                source: { bucket, key },
                structured: structuredResume,
              }),
              aiScore: finalScore,
              aiReport: completedPayload,
              resumeStatus: finalStatus,
            },
          });

          if (app?.id) {
            await prisma.application.update({
              where: { id: app.id },
              data: {
                fullName: structuredResume?.full_name || candidate.fullName,
                email: structuredResume?.email || "",
                phone: structuredResume?.phone || "",
                resumeText: resumeRawText,
                resumeData: JSON.stringify(structuredResume),
                aiScore: finalScore,
                aiReport: completedPayload,
                resumeStatus: finalStatus,
                interviewStatus: "pending",
                hiringStatus: "pending",
              },
            });
            await appendCandidateActivity(app.id, {
              type: "resume_screened",
              label: finalStatus === "shortlisted" ? "Resume shortlisted" : "Resume rejected",
              details: `AI score ${finalScore} vs threshold ${threshold}`,
              timestamp: new Date().toISOString(),
              source: "system",
            }).catch(() => {});
          }

          console.log(
            `[RESUME-WORKER] Candidate ${candidate.id}: completed score=${finalScore} status=${finalStatus}`
          );

          if (scoreResult?.usage?.inputTokens || scoreResult?.usage?.outputTokens) {
            await recordOrgBillingUsage({
              orgId,
              feature: "resumeReport",
              usage: {
                model: scoreResult.usage.model || "gpt-4o",
                inputTokens: scoreResult.usage.inputTokens || 0,
                outputTokens: scoreResult.usage.outputTokens || 0,
                cachedInputTokens: scoreResult.usage.cachedInputTokens || 0,
              },
            }).catch(() => {});
          }
        } catch (error: any) {
          const failPayload = JSON.stringify({
            processing: {
              stage: "failed",
              progress: 100,
              error: error?.message || "Resume processing failed",
            },
          });
          console.error(`[RESUME-WORKER] Candidate ${candidate.id}: failed -> ${error?.message || error}`);
          const app = await prisma.application.findFirst({
            where: { resumeUrl: { contains: `candidateId=${candidate.id}` } },
            select: { id: true },
          });
          await prisma.resumeCandidate.update({
            where: { id: candidate.id },
            data: {
              resumeStatus: "failed",
              aiScore: 0,
              aiReport: failPayload,
            },
          }).catch(() => {});
          if (app?.id) {
            await prisma.application.update({
              where: { id: app.id },
              data: {
                resumeStatus: "failed",
                aiScore: 0,
                aiReport: failPayload,
              },
            }).catch(() => {});
          }
          throw error;
        } finally {
          if (tmpPdfPath) await unlink(tmpPdfPath).catch(() => {});
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        processedCount += 1;
      } else {
        failedCount += 1;
      }
    }

    await prisma.resumeBatch.update({
      where: { id: batchId },
      data: { processedCount, failedCount },
    });
  }

  if (failedCount > 0 && processedCount === 0) {
    await prisma.resumeBatch.update({
      where: { id: batchId },
      data: { status: "FAILED", processedCount, failedCount },
    });
    return;
  }

  await prisma.resumeBatch.update({
    where: { id: batchId },
    data: {
      status: "COMPLETED",
      processedCount,
      failedCount,
      completedAt: new Date(),
    },
  });
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
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "Interview" ("id", "applicationId", status, "interviewRecordingUrl", "interviewRecordedAt", "interviewTranscript", "completedAt", "createdAt", "updatedAt")
    VALUES ($6::text, $1::text, COALESCE($2::text, 'IN_PROGRESS'), $3::text, CASE WHEN $3::text IS NOT NULL THEN $5::timestamp ELSE NULL END, $4::text, CASE WHEN $2::text = 'COMPLETED' THEN $5::timestamp ELSE NULL END, $5::timestamp, $5::timestamp)
    ON CONFLICT ("applicationId")
    DO UPDATE SET
      status = COALESCE($2::text, "Interview".status),
      "interviewRecordingUrl" = COALESCE($3::text, "Interview"."interviewRecordingUrl"),
      "interviewRecordedAt" = CASE WHEN $3::text IS NOT NULL THEN $5::timestamp ELSE "Interview"."interviewRecordedAt" END,
      "interviewTranscript" = COALESCE($4::text, "Interview"."interviewTranscript"),
      "completedAt" = CASE WHEN $2::text = 'COMPLETED' THEN $5::timestamp ELSE "Interview"."completedAt" END,
      "updatedAt" = $5::timestamp
    `,
    applicationId,
    interviewStatus || null,
    recordingUrl || null,
    transcript || null,
    now,
    fallbackId
  );
}
console.log("Worker started: Awaiting jobs...");
const managedWorkers: Worker[] = [];
let backupQueue: Queue | null = null;
let shutdownInProgress = false;
let setupCronJobs: (() => Promise<void>) | null = null;
const requestedQueues = new Set(
  (process.env.WORKER_QUEUES || "resume-processing")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
);

function isQueueEnabled(queueName: string) {
  return requestedQueues.has("all") || requestedQueues.has(queueName);
}

function trackWorker(name: string, worker: Worker) {
  managedWorkers.push(worker);
  worker.on("error", (error) => {
    console.error(`[${name}] Redis/BullMQ error:`, error);
  });
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
if (isQueueEnabled("resume-processing")) {
  const worker = trackWorker('resume-processing', new Worker('resume-processing', async (job) => {
    if (job.name === "drive-resume-batch") {
      await processDriveResumeBatchJob(job);
      return;
    }

    const { applicationId, resumeText: initialResumeText, resumeUrl, jdText, drive, applicantEmail, applicantName, structuredResume: initialStructuredResume } = job.data;
    console.log(`[JOB] Processing application ${applicationId} for ${applicantEmail}`);
    // Guard: skip if the application record was deleted
    const appExists = await prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        resumeStatus: true,
        aiScore: true,
        aiReport: true,
      },
    });
    if (!appExists) {
      console.warn(`[JOB] Application ${applicationId} no longer exists. Discarding stale job.`);
      return;
    }
    const normalizedExistingStatus = String(appExists.resumeStatus || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_");
    const alreadyFinalized =
      ["SHORTLISTED", "ACCEPTED", "REJECTED"].includes(normalizedExistingStatus) &&
      appExists.aiScore !== null &&
      !!appExists.aiReport;
    if (alreadyFinalized && !job.data.force) {
      console.log(
        `[JOB] Application ${applicationId} already finalized (${normalizedExistingStatus}). Skipping duplicate processing.`
      );
      return;
    }
    let resumeText = initialResumeText || "";
    let structuredResume = initialStructuredResume || {};
    let tempResumePath: string | null = null;
    let tempInputPath: string | null = null;
    try {
      // 1. ENSURE TEXT & STRUCTURE (Always re-extract if text is empty)
      const needsExtraction = !resumeText || resumeText.length < 10 || Object.keys(structuredResume).length === 0;
      if (needsExtraction) {
        console.log(`[JOB] Resume text or structure missing. Initiating extraction...`);
        // Check if resumeUrl is a valid HTTP(S) URL
        const isRemoteUrl = typeof resumeUrl === 'string' && (resumeUrl.startsWith('http://') || resumeUrl.startsWith('https://'));
        if (isRemoteUrl) {
          tempResumePath = join(tmpdir(), `resume_${applicationId}_${Date.now()}.pdf`);
          try {
            console.log(`[JOB] Fetching remote resume for extraction: ${resumeUrl}`);
            const response = await fetch(resumeUrl);
            if (!response.ok) throw new Error(`Failed to fetch resume: ${response.statusText}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            await writeFile(tempResumePath, buffer);
          } catch (fetchErr) {
            console.warn(`[JOB] Could not download resume from ${resumeUrl}:`, fetchErr);
            tempResumePath = null;
          }
        }
        if (tempResumePath) {
          const extractProcess = spawn(pythonCmd, ["scripts/extract_pdf.py", tempResumePath, "RESUME"]);
          let extractionOutput = "";
          await new Promise((resolve, reject) => {
            extractProcess.stdout.on("data", (data) => { extractionOutput += data.toString(); });
            extractProcess.on("close", (code) => {
              if (code !== 0) reject(new Error(`Extraction failed code ${code}`));
              else resolve(null);
            });
          });
          try {
            const parsedExtraction = JSON.parse(extractionOutput);
            resumeText = parsedExtraction.text || resumeText;
            structuredResume = parsedExtraction.data || structuredResume;
          } catch (parseErr) {
            console.error(`[JOB] Failed to parse extraction output`);
          }
        } else if (resumeText) {
          // If we have text but no file, we might still want to "extract" structure from the text
          // But for now, we'll assume the text is enough for scoring
          console.log(`[JOB] No remote file found, but have resumeText. Proceeding.`);
        }
      } else {
        console.log(`[JOB] Using provided resume text and structured data.`);
      }
      // Update the DB with the latest structured data
      await (prisma.application as any).update({
        where: { id: applicationId },
        data: {
          resumeText: resumeText || "",
          experienceYears: (structuredResume as any)?.experience?.total_years != null ? parseFloat(String((structuredResume as any).experience.total_years)) : null,
        }
      });
      // 2. SCORING (Structured JD vs Structured Resume)
      console.log(`[JOB] Scoring candidate ${applicantEmail} using Structured Data...`);
      let aiResult: { score: number; status: string; reasoning: string; hard_rejected?: boolean } = { score: 0, status: "Pending", reasoning: "No resume data" };
      // Always read the latest drive settings from DB (never trust queued snapshot).
      const latestDrive = await (prisma.drive as any).findUnique({
        where: { id: drive.id },
        select: {
          title: true,
          description: true,
          extractedDetails: true,
          screeningThreshold: true,
          screeningCriteria: true,
          orgId: true,
        },
      });
      const THRESHOLD = Number(latestDrive?.screeningThreshold ?? 60) || 60;
      const singleJobParsedSettings = parseDriveScreeningSettings(
        latestDrive?.screeningCriteria,
        THRESHOLD
      );
      const singleJobScreeningCriteria = singleJobParsedSettings.criteria;
      // Parse JD details if stored as string
      let jdDetails: Record<string, any> = {};
      try {
        jdDetails = typeof latestDrive?.extractedDetails === 'string'
          ? JSON.parse(latestDrive.extractedDetails)
          : (latestDrive?.extractedDetails as unknown as Record<string, any>) || {};
        if (typeof jdDetails !== 'object' || Array.isArray(jdDetails) || jdDetails === null) {
          console.warn(`[JOB] extractedDetails is not a plain object after parsing - resetting to {}`);
          jdDetails = {};
        }
      } catch (e) {
        console.warn(`[JOB] Failed to parse extractedDetails for drive ${drive.id}:`, e);
        jdDetails = {};
      }
      const scoringInput = {
        resume: structuredResume,
        jd: jdDetails,
        resume_raw_text: resumeText,
        jd_raw_text: jdText || latestDrive?.description || (drive as any).description || "",
        threshold: THRESHOLD,
        screening_criteria: singleJobScreeningCriteria,
      };
      tempInputPath = join(tmpdir(), `scoring_${Date.now()}_${Math.random().toString(36).substring(7)}.json`);
      await writeFile(tempInputPath, JSON.stringify(scoringInput));
      const pythonProcess = spawn(pythonCmd, ["scripts/extract_pdf.py", tempInputPath, "SCORE"]);
      let outputData = "";
      let errorData = "";
      await new Promise((resolve, reject) => {
        pythonProcess.stdout.on("data", (data) => { outputData += data.toString(); });
        pythonProcess.stderr.on("data", (data) => {
          const chunk = data.toString();
          errorData += chunk;
          process.stderr.write(chunk); // Pipe to main console for real-time visibility
        });
        pythonProcess.on("close", (code) => {
          if (code !== 0) reject(new Error(`Python script exited with code ${code}: ${errorData}`));
          else resolve(null);
        });
      });
      await unlink(tempInputPath).catch(() => { });
      if (tempResumePath) await unlink(tempResumePath).catch(() => { });
      const parsed = JSON.parse(outputData);
      aiResult = parsed.data || parsed;
      const currentScore = Math.max(0, Math.min(100, parseInt(aiResult.score?.toString() || "0") || 0));
      const normalizedAiStatus = String(aiResult.status || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_");
      // The DB screeningThreshold is the ONLY source of truth for pass/fail.
      // hard_rejected from Python is purely informational (shown in report to HR)
      // but can NEVER override the admin-configured threshold.
      // If admin sets threshold=1%, a score of 26 MUST shortlist - no exceptions.
      const resumeStatus: "SHORTLISTED" | "REJECTED" =
        currentScore >= THRESHOLD ? "SHORTLISTED" : "REJECTED";
      // 2. Update DB
      const exists = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { id: true }
      });
      if (!exists) {
        console.warn(`[JOB] Application ${applicationId} no longer exists. Skipping update.`);
        return;
      }
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          resumeStatus: resumeStatus,
          aiScore: currentScore,
          aiReport: JSON.stringify(aiResult),
          ...(resumeStatus === "REJECTED" && {
            interviewStatus: "Not Qualified",
            hiringStatus: "Not Shortlisted",
          }),
        }
      });
      console.log(`[SUCCESS] Candidate ${applicantEmail} scored ${currentScore}. Status: ${resumeStatus}`);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sreevaai.com';
      try {
        const syncToken = process.env.WORKER_SYNC_TOKEN?.trim() || process.env.JWT_SECRET?.trim();
        const syncRes = await fetch(`${appUrl}/api/admin/candidates/${applicationId}/sync`, {
          method: 'POST',
          headers: syncToken ? { "x-internal-sync-token": syncToken } : undefined,
        });
        if (!syncRes.ok) {
          const errorText = await syncRes.text().catch(() => 'No error body');
          throw new Error(`Pinecone sync failing status ${syncRes.status}: ${errorText}`);
        }
        console.log(`[SYNC] Pinecone sync triggered for ${applicationId}`);
      } catch (err: any) {
        console.error(`[SYNC ERROR] Critical failure in Pinecone sync: ${err.message}`);
        // Keep the candidate flow moving even if Pinecone is temporarily unavailable.
        // Email delivery and status updates are more important than search indexing.
      }
      // 4. Interview invite / status email flow
      const { sendApplicationStatusEmail } = await import('./lib/mail');
      if (resumeStatus === 'SHORTLISTED') {
        // New flow: shortlist only sends scheduling URL.
        // Interview row/token are created later during slot booking.
        const baseUrl = appUrl;
        const interviewLink = `${baseUrl}/interview/${applicationId}/schedule`;
        const emailResult = await sendApplicationStatusEmail({
          email: applicantEmail,
          fullName: applicantName,
          jobTitle: latestDrive?.title || drive.title,
          status: resumeStatus,
          interviewLink
        });
        if (emailResult?.success === false) {
          console.warn(`[EMAIL WARN] Interview invite not sent to ${applicantEmail}:`, emailResult.error);
        } else {
          console.log(`[EMAIL] Interview scheduling invite sent to ${applicantEmail}`);
        }
      } else {
        // Voice interview DISABLED or candidate REJECTED -> plain status email only, no interview link
        await sendApplicationStatusEmail({
          email: applicantEmail,
          fullName: applicantName,
          jobTitle: latestDrive?.title || drive.title,
          status: 'REJECTED',
        });
        console.log(`[EMAIL] Status-only email sent to ${applicantEmail}  status: ${resumeStatus}`);
      }
    } catch (error) {
      console.error(`[ERROR] Job ${job.id} failed:`, error);
      if (tempResumePath) await unlink(tempResumePath).catch(() => { });
      if (tempInputPath) await unlink(tempInputPath).catch(() => { });
      throw error; // Rethrow so BullMQ knows it failed and can retry
    }
  }, {
    connection: redisConnection,
    concurrency: 1, // Keep one heavy scoring process per worker to avoid lock starvation
    lockDuration: 15 * 60 * 1000, // Scoring + extraction can exceed 60s on slower machines
    stalledInterval: 5 * 60 * 1000, // Check for stalled jobs every 5 min to reduce Redis writes
    maxStalledCount: 1,
    drainDelay: 300, // Poll every 300ms — ensures jobs are picked up even if pub/sub event missed
    removeOnComplete: { count: 0 }, // Delete immediately — keeps 0 completed jobs
    removeOnFail: { count: 10 } // KEEP ONLY 10 FAILURES FOR DEBUGGING
  }));
  worker.on('failed', (job, err) => {
    console.log(`[FATAL] Job ${job?.id} failed permanently: ${err.message}`);
  });
}
if (isQueueEnabled("invitation-delivery-queue")) {
  const invitationDeliveryWorker = trackWorker("invitation-delivery-queue", new Worker(
    "invitation-delivery-queue",
    async (job) => {
      const {
        applicationId,
        action,
        emailType,
        scheduledAt,
      }: {
        applicationId?: string;
        action?: "shortlist" | "reject" | "hire" | "nothired" | "confirm";
        emailType?: "screening" | "hiring";
        scheduledAt?: string;
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
              status: true,
            },
          },
          interview: {
            select: {
              id: true,
              accessToken: true,
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
      if (application.drive?.status && application.drive.status !== "ACTIVE") {
        console.warn(`[Invitation Worker] Drive ${application.drive.id} is ${application.drive.status}. Skipping.`);
        return { skipped: true, reason: "drive_inactive" };
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sreevaai.com';
      const now = new Date();
      const scheduledDate = scheduledAt ? new Date(scheduledAt) : now;
      let interviewLink: string | undefined;
      if (action === "shortlist") {
        await prisma.interview.upsert({
          where: { applicationId },
          update: {
            inviteSentAt: now,
            status: "PENDING",
            startedAt: null,
            completedAt: null,
            scheduledAt: null,
            slotId: null,
          },
          create: {
            id: generateId("int", application.fullName || applicationId),
            applicationId,
            inviteSentAt: now,
            status: "PENDING",
          },
        });
        // Create interview row first, generate token only at slot booking.
        const baseUrl = appUrl;
        interviewLink = `${baseUrl}/interview/${applicationId}/schedule`;
      } else if (action === "confirm") {
        const baseUrl = appUrl;
        const interviewBase = `${baseUrl}/interview/${applicationId}`;
        interviewLink = isInterviewTokenRequired() && application.interview?.accessToken
          ? `${interviewBase}?token=${application.interview.accessToken}`
          : interviewBase;
        console.log(`[Invitation Worker] Generated confirmation link: ${interviewLink}`);
      }
      const { sendApplicationStatusEmail } = await import('./lib/mail');
      const actionStatusMap: Record<"shortlist" | "reject" | "hire" | "nothired" | "confirm", "SHORTLISTED" | "REJECTED" | "Hired" | "CONFIRMED"> = {
        shortlist: "SHORTLISTED",
        reject: "REJECTED",
        nothired: "REJECTED",
        hire: "Hired",
        confirm: "CONFIRMED",
      };
      // Scheduling flow must never send rejection content:
      // shortlist + confirm emails stay in the shortlisted pipeline.
      const emailStatus = action === "confirm" ? "SHORTLISTED" : actionStatusMap[action];
      if (!emailStatus) {
        throw new Error(`Unsupported invitation action: ${action}`);
      }
      console.log(`[Invitation Worker] Mapped status: action=${action} -> emailStatus=${emailStatus}`);
      const mailResult = await sendApplicationStatusEmail({
        email: application.email,
        fullName: application.fullName || "Candidate",
        jobTitle: application.drive?.title || "Unknown Role",
        orgName: undefined,
        status: emailStatus,
        interviewLink,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      });
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
      await appendCandidateActivity(applicationId, {
        type: "email_sent",
        label: action === "shortlist" ? "Shortlisted email sent" : action === "hire" ? "Hire email sent" : action === "confirm" ? "Interview confirmation email sent" : "Rejection email sent",
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
      removeOnComplete: { count: 0 },
      removeOnFail: { count: 10 },
    }
  ));
  invitationDeliveryWorker.on("failed", (job, err) => {
    console.log(`[FATAL] Invitation Delivery Job ${job?.id} failed permanently: ${err.message}`);
  });
}
/**
 * ðŸ’¾ DATABASE BACKUP WORKER (Phase 5 - Persistent Backups to R2)
 * Runs daily at midnight to export core hiring data.
 */
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
            department: true,
            description: true,
            type: true,
            screeningThreshold: true,
            creatorId: true,
            createdAt: true,
            updatedAt: true,
            positions: true,
            workMode: true,
            experience: true,
            responsibilities: true,
            requirements: true,
            salary: true,
            skills: true,
            extractedDetails: true,
            interviewLanguage: true,
            interviewQuestions: true,
            jdFileName: true,
            jdPreviewUrl: true,
            orgId: true,
            location: true,
            aiName: true,
            cartesiaVoiceId: true,
            sarvamVoice: true,
            googleModel: true,
            googleVoiceName: true,
            ttsProvider: true,
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
      removeOnComplete: { count: 0 }, // Delete immediately — keeps 0 completed jobs
      removeOnFail: { count: 3 },
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
/**
 * INTERVIEW FINALIZATION WORKER
 * Persists recording/transcript/status updates asynchronously.
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
        const updateData: any = { updatedAt: new Date() };
        if (recordingUrl) {
          updateData.interviewRecordingUrl = recordingUrl;
          updateData.interviewRecordedAt = new Date();
        }
        if (transcript) {
          updateData.interviewTranscript = transcript;
        }
        if (interviewStatus) {
          updateData.status = interviewStatus;
        }
        if (interviewStatus === "COMPLETED") {
          updateData.completedAt = new Date();
        }
        try {
          const appForId = await prisma.application.findUnique({ where: { id: applicationId }, select: { fullName: true } });
          await (prisma as any).interview.upsert({
            where: { applicationId },
            update: updateData,
            create: {
              id: generateId("int", appForId?.fullName || applicationId),
              applicationId,
              status: interviewStatus || "IN_PROGRESS",
              ...updateData,
            },
          });
        } catch {
          await persistInterviewUpdateRaw({ applicationId, recordingUrl, transcript, interviewStatus });
        }

        // Billing deduction is handled atomically in /api/interview/finalize to prevent
        // double-billing. Worker only handles recording/transcript persistence.

        if (appStatus) {
          await prisma.$executeRawUnsafe(
            'UPDATE "Application" SET "resumeStatus" = $1, "updatedAt" = NOW() WHERE id = $2',
            appStatus,
            applicationId
          );
        }
        console.log(`[SUCCESS] Interview finalization persisted for ${applicationId}`);
        return { success: true };
      } catch (error) {
        console.error(`[Interview Finalization Worker Error]:`, error);
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: 2,
      lockDuration: 5 * 60 * 1000,
      stalledInterval: 5 * 60 * 1000, // Check for stalled jobs every 5 min to reduce Redis writes
      maxStalledCount: 1,
      removeOnComplete: { count: 0 }, // Delete immediately — keeps 0 completed jobs
      removeOnFail: { count: 10 }
    }
  ));
  interviewFinalizationWorker.on("failed", (job, err) => {
    console.log(`[FATAL] Interview Finalization Job ${job?.id} failed permanently: ${err.message}`);
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
            drive: { select: { title: true } },
          },
        });
        // 3. Resolve Folder & Key
        const rawName = [application?.fullName, application?.drive?.title].filter(Boolean).join(" - ") || candidateName || applicationId;
        const safeName = rawName
          .replace(/[^a-zA-Z0-9_\- ]/g, "")
          .trim()
          .replace(/\s+/g, "_")
          .toLowerCase();
        const timestamp = Date.now();
        const snapshotLabel = label || "snapshot";
        const key = `candidates/${safeName}/snapshots/${snapshotLabel}_${timestamp}.jpg`;
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
      removeOnComplete: { count: 0 }, // Delete immediately - keeps 0 completed jobs
      removeOnFail: { count: 1 }
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
      removeOnComplete: { count: 0 }, // Delete immediately — keeps 0 completed jobs
      removeOnFail: { count: 10 }
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
      const { kind, orgOpenAIModel = "gpt-5.4-mini" } = job.data || {};
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
        const response = await fetch(url);
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
      removeOnComplete: { count: 0 },
      removeOnFail: { count: 25 },
    }
  ));
  jdExtractionWorker.on("failed", (job, err) => {
    console.log(`[FATAL] JD Extraction Job ${job?.id} failed: ${err.message}`);
  });
}
console.log("🚀 Workers are running and listening for jobs...");
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
];
async function purgeAllQueues() {
  console.log("[Worker] 🧹 Cleaning Redis queues to free memory...");
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
      console.log(`  ✅ Deleted ${deletedCount} orphaned BullMQ key(s).`);
    } else {
      console.log(`  ✅ Redis queues are clean.`);
    }
  } catch (err: any) {
    console.warn(`  ⚠️ Could not purge keys: ${err.message}`);
  }
  // Report memory after cleanup
  const { usedMemory, maxMemory } = await getRedisMemoryStatus();
  if (usedMemory && maxMemory && maxMemory > 0) {
    const pct = Math.round((usedMemory / maxMemory) * 100);
    console.log(
      `[Worker] 📊 Redis after cleanup: ${formatBytes(usedMemory)} / ${formatBytes(maxMemory)} (${pct}%)`
    );
    if (pct >= 90) {
      console.warn(
        `[Worker] ⚠️ Redis still at ${pct}% after cleanup — consider upgrading your Redis plan.`
      );
    }
  }
}
/**
 * ðŸ› ï¸  REDIS CONFIGURATION & CRON SETUP
 * Attempts to set safe Redis settings and register repeatable jobs.
 */
async function initializeWorkerMetadata() {
  try {
    console.log("[Worker] Checking Redis configuration...");
    // Attempt to set eviction policy to noeviction for BullMQ stability
    // Note: Many managed providers (like Redis Cloud free) block this command
    try {
      await redisConnection.config('SET', 'maxmemory-policy', 'noeviction');
      console.log("  ✅ Redis eviction policy set to 'noeviction'");
    } catch (configErr: any) {
      console.warn(`  âš ï¸  Could not set Redis eviction policy (provider restricted): ${configErr.message}`);
      console.warn("  â„¹ï¸  Running queue cleanup to free memory instead...");
    }
    // Removed destructive purgeAllQueues() which deletes pending user uploads on restart
    // await purgeAllQueues();
    if (await shouldSkipCronRegistration()) {
      console.warn("  âš ï¸  Cron registration skipped because Redis is still near its memory limit.");
      return;
    }
    console.log("[Worker] Registering recurring daily backup job...");
    if (setupCronJobs) {
      try {
        await setupCronJobs();
        console.log("  ??? Daily backup job registered successfully.");
      } catch (cronErr: any) {
        console.error("  ?? ?? Failed to register backup job (Redis memory may be full):", cronErr.message);
        console.warn("  ??????????  Continuing worker initialization. Background scoring will still function.");
      }
    }
  } catch (err: any) {
    console.error("[Worker] Critical error during metadata initialization:", err.message);
  }
}
initializeWorkerMetadata();
