import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { join } from 'path';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { writeFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { prisma } from './lib/prisma';
import * as dotenv from 'dotenv';
import { putObject } from "./lib/s3";
import { generateId } from "./lib/ids";
import { isInterviewTokenRequired } from "./lib/interview-access";
import { appendCandidateActivity } from "./lib/candidate-activity";
import { getPythonExecutable } from "./lib/python-exec";
import { deductInterviewQuota, getInterviewQuotaUnits, incrementOrgCreditsUsed } from "./lib/credits";
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
const pythonCmd = getPythonExecutable();
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
const redisConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => Math.min(times * 500, 10_000),
});
console.log('🚀 Worker started: Awaiting jobs...');
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
const worker = new Worker('resume-processing', async (job) => {
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
                orgId: true,
      },
    });
    // Threshold source of truth: DB value; fallback must be 0 (not 70).
    const THRESHOLD = Number(latestDrive?.screeningThreshold ?? 0) || 0;
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
        threshold: THRESHOLD
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
    await unlink(tempInputPath).catch(() => {});
    if (tempResumePath) await unlink(tempResumePath).catch(() => {});
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
      // Voice interview is ENABLED -> create interview record and send link
      const interview = await (prisma as any).interview.upsert({
        where: { applicationId },
        update: {
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          status: "PENDING",
        },
        create: {
          id: generateId("int", applicantName),
          applicationId,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          status: "PENDING",
        },
      });
      // Force localhost since we are testing locally and dotenv is being overwritten
      const baseUrl = 'http://localhost:3000';
      const interviewLink = `${baseUrl}/interview/${applicationId}/schedule?token=${interview.accessToken}`;
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
        console.log(`[EMAIL] Interview invite sent to ${applicantEmail} (voice interview enabled)`);
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
    if (tempResumePath) await unlink(tempResumePath).catch(() => {});
    if (tempInputPath) await unlink(tempInputPath).catch(() => {});
    throw error; // Rethrow so BullMQ knows it failed and can retry
  }
}, {
  connection: redisConnection,
  concurrency: 1, // Keep one heavy scoring process per worker to avoid lock starvation
  lockDuration: 15 * 60 * 1000, // Scoring + extraction can exceed 60s on slower machines
  stalledInterval: 5 * 60 * 1000, // Check for stalled jobs every 5 min to reduce Redis writes
  maxStalledCount: 1,
  removeOnComplete: { count: 0 }, // Delete immediately — keeps 0 completed jobs
  removeOnFail: { count: 10 } // KEEP ONLY 10 FAILURES FOR DEBUGGING
});
worker.on('failed', (job, err) => {
  console.log(`[FATAL] Job ${job?.id} failed permanently: ${err.message}`);
});
const invitationDeliveryWorker = new Worker(
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
    const now = new Date();
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : now;
    let interviewLink: string | undefined;
    if (action === "shortlist") {
      const newToken = randomUUID();
      const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      if (application.interview) {
        await (prisma.interview as any).update({
          where: { id: application.interview.id },
          data: {
            accessToken: newToken,
            inviteSentAt: now,
            expiresAt,
            status: "PENDING",
            startedAt: null,
            completedAt: null,
            scheduledAt: null,
            slotId: null,
          },
        });
      } else {
        await (prisma.interview as any).create({
          data: {
            id: generateId("int", application.fullName || applicationId),
            applicationId,
            accessToken: newToken,
            inviteSentAt: now,
            expiresAt,
            status: "PENDING",
          },
        });
      }
      // Force localhost since we are testing locally
      const baseUrl = 'http://localhost:3000';
      const interviewBase = `${baseUrl}/interview/${applicationId}/schedule`;
      interviewLink = isInterviewTokenRequired()
        ? `${interviewBase}?token=${newToken}`
        : interviewBase;
    } else if (action === "confirm") {
      // Force localhost since we are testing locally
      const baseUrl = 'http://localhost:3000';
      const interviewBase = `${baseUrl}/interview/${applicationId}`;
      interviewLink = isInterviewTokenRequired() && application.interview?.accessToken
        ? `${interviewBase}?token=${application.interview.accessToken}`
        : interviewBase;
      console.log(`[Invitation Worker] Generated confirmation link: ${interviewLink}`);
    }
    const { sendApplicationStatusEmail } = await import('./lib/mail');
    const emailStatus = action === "shortlist"
      ? "SHORTLISTED"
      : action === "hire"
        ? "Hired"
        : action === "confirm"
          ? "CONFIRMED"
          : "REJECTED";
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
      const reason = mailResult.error || "Unknown email delivery error";
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
);
invitationDeliveryWorker.on("failed", (job, err) => {
  console.log(`[FATAL] Invitation Delivery Job ${job?.id} failed permanently: ${err.message}`);
});
/**
 * ðŸ’¾ DATABASE BACKUP WORKER (Phase 5 - Persistent Backups to R2)
 * Runs daily at midnight to export core hiring data.
 */
const backupWorker = new Worker(
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
          inviteScheduleDays: true,
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
);
// Setup Recurring Backup Job (Daily at Midnight)
const backupQueue = new Queue("backup-queue", { connection: redisConnection });
async function setupCronJobs() {
    // Clean up old ones first to avoid duplicates on restart
    const repeatableJobs = await backupQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await backupQueue.removeRepeatableByKey(job.key);
    }
    await backupQueue.add(
        "daily-backup",
        {},
        {
            repeat: {
                pattern: "0 0 * * *", // Midnight daily
            },
        }
    );
    console.log("[Worker] Registered recurring daily backup job.");
}
/**
 * INTERVIEW FINALIZATION WORKER
 * Persists recording/transcript/status updates asynchronously.
 */
const interviewFinalizationWorker = new Worker(
  "interview-finalization",
  async (job) => {
    const { applicationId, recordingUrl, transcript, interviewStatus, appStatus } = job.data || {};
    if (!applicationId) {
      throw new Error("Missing applicationId in interview-finalization job");
    }
    console.log(`[JOB] Finalizing interview for ${applicationId}`);
    try {
      const interviewBefore = await prisma.interview.findUnique({
        where: { applicationId },
        select: {
          completedAt: true,
          recordingDurationSec: true,
          interviewDuration: true,
          startedAt: true,
          application: {
            select: {
              drive: {
                select: { orgId: true },
              },
            },
          },
        },
      });

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

      const orgId = interviewBefore?.application?.drive?.orgId;
      const isNewCompletion = !interviewBefore?.completedAt && interviewStatus === "COMPLETED";
      const resolvedDurationSec = Number(
        interviewBefore?.recordingDurationSec ??
        interviewBefore?.interviewDuration ??
        0
      );
      const fallbackDurationSec = Number.isFinite(resolvedDurationSec) && resolvedDurationSec > 0
        ? resolvedDurationSec
        : interviewBefore?.startedAt
          ? Math.max(1, Math.round((Date.now() - new Date(interviewBefore.startedAt).getTime()) / 1000))
          : 0;

      if (orgId && isNewCompletion) {
        const quotaUnits = getInterviewQuotaUnits(fallbackDurationSec);
        if (quotaUnits > 0) {
          await deductInterviewQuota(orgId, quotaUnits);
        }
        if (fallbackDurationSec > 0) {
          const creditsDelta = Math.round((fallbackDurationSec / 60) * 100) / 100;
          if (creditsDelta > 0) {
            await incrementOrgCreditsUsed(orgId, creditsDelta);
          }
        }
      }

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
);
interviewFinalizationWorker.on("failed", (job, err) => {
  console.log(`[FATAL] Interview Finalization Job ${job?.id} failed permanently: ${err.message}`);
});
/**
 * ðŸ“¸ INTERVIEW SNAPSHOT WORKER
 * Handles proctoring snapshot uploads to R2 and DB persistence.
 * Optimized for low-memory Redis (32MB).
 */
const interviewSnapshotWorker = new Worker(
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
);
interviewSnapshotWorker.on("failed", (job, err) => {
  console.log(`[FATAL] Snapshot Job ${job?.id} failed: ${err.message}`);
});
/**
 * ðŸ“„ JD UPLOAD WORKER
 * Handles asynchronous uploading of AI-generated JD PDFs to Cloudflare R2.
 */
const jdUploadWorker = new Worker(
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
);
jdUploadWorker.on("failed", (job, err) => {
    console.log(`[FATAL] JD Upload Job ${job?.id} failed: ${err.message}`);
});
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
        try {
            await setupCronJobs();
            console.log("  ✅ Daily backup job registered successfully.");
        } catch (cronErr: any) {
            console.error("  â Œ Failed to register backup job (Redis memory may be full):", cronErr.message);
            console.warn("  âš ï¸  Continuing worker initialization. Background scoring will still function.");
        }
    } catch (err: any) {
        console.error("[Worker] Critical error during metadata initialization:", err.message);
    }
}
initializeWorkerMetadata();
