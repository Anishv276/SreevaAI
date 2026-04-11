import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { join } from 'path';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { writeFile, unlink } from 'fs/promises';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { putObject } from "./lib/s3";

// Load environment variables
dotenv.config();

console.log('DEBUG: REDIS_URL length:', process.env.REDIS_URL?.length || 0);
if (!process.env.REDIS_URL) {
  console.error('❌ FATAL: REDIS_URL is missing from environment variables!');
  process.exit(1);
}

const prisma = new PrismaClient();
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

async function persistInterviewUpdateRaw(params: {
  applicationId: string;
  recordingUrl?: string;
  transcript?: string;
  interviewStatus?: string;
}) {
  const { applicationId, recordingUrl, transcript, interviewStatus } = params;

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "Interview" ("applicationId", status, "interviewRecordingUrl", "interviewRecordedAt", "interviewTranscript", "completedAt", "createdAt", "updatedAt")
    VALUES ($1, COALESCE($2, 'IN_PROGRESS'), $3, CASE WHEN $3 IS NOT NULL THEN NOW() ELSE NULL END, $4, CASE WHEN $2 = 'COMPLETED' THEN NOW() ELSE NULL END, NOW(), NOW())
    ON CONFLICT ("applicationId")
    DO UPDATE SET
      status = COALESCE($2, "Interview".status),
      "interviewRecordingUrl" = COALESCE($3, "Interview"."interviewRecordingUrl"),
      "interviewRecordedAt" = CASE WHEN $3 IS NOT NULL THEN NOW() ELSE "Interview"."interviewRecordedAt" END,
      "interviewTranscript" = COALESCE($4, "Interview"."interviewTranscript"),
      "completedAt" = CASE WHEN $2 = 'COMPLETED' THEN NOW() ELSE "Interview"."completedAt" END,
      "updatedAt" = NOW()
    `,
    applicationId,
    interviewStatus || null,
    recordingUrl || null,
    transcript || null
  );

}

const redisConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => Math.min(times * 500, 10_000),
});

console.log('🚀 Worker started: Awaiting jobs...');

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

  if (alreadyFinalized) {
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
        structuredResume: JSON.stringify(structuredResume || {}),
        experienceYears: (structuredResume as any)?.experience?.total_years || null,
      }
    });

    // 2. SCORING (Structured JD vs Structured Resume)
    console.log(`[JOB] Scoring candidate ${applicantEmail} using Structured Data...`);
    let aiResult: { score: number; status: string; reasoning: string; hard_rejected?: boolean } = { score: 0, status: "Pending", reasoning: "No resume data" };

    // Always read the latest drive settings from DB (never trust queued snapshot).
    const latestDrive = await prisma.drive.findUnique({
      where: { id: drive.id },
      select: {
        title: true,
        description: true,
        extractedDetails: true,
        screeningThreshold: true,
        interviewEnabled: true,
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
        console.warn(`[JOB] extractedDetails is not a plain object after parsing — resetting to {}`);
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
    // If admin sets threshold=1%, a score of 26 MUST shortlist — no exceptions.
    const resumeStatus: "SHORTLISTED" | "REJECTED" =
      currentScore >= THRESHOLD ? "SHORTLISTED" : "REJECTED";

    // 2. Update DB
    const exists = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, submissionData: true, experienceYears: true }
    });
    if (!exists) {
      console.warn(`[JOB] Application ${applicationId} no longer exists. Skipping update.`);
      return;
    }

    // Restore experienceYears from submissionData if not already set in DB column
    const submissionData = (exists.submissionData as any) || {};
    const savedExpYears = exists.experienceYears;
    const expFromSubmission =
      submissionData.experienceYears != null
        ? parseFloat(String(submissionData.experienceYears))
        : submissionData.experience != null && submissionData.experience !== ""
          ? parseFloat(String(submissionData.experience))
          : null;
    const resolvedExperienceYears = (savedExpYears != null && !isNaN(savedExpYears))
      ? savedExpYears
      : (!isNaN(expFromSubmission as number) ? expFromSubmission : null);

    await prisma.application.update({
      where: { id: applicationId },
      data: {
        resumeStatus: resumeStatus,
        aiScore: currentScore,
        aiReport: JSON.stringify(aiResult),
        ...(resolvedExperienceYears != null && { experienceYears: resolvedExperienceYears }),
        ...(resumeStatus === "REJECTED" && {
          interviewStatus: "Not Qualified",
          hiringStatus: "Not Shortlisted",
        }),
      }
    });

    console.log(`[SUCCESS] Candidate ${applicantEmail} scored ${currentScore}. Status: ${resumeStatus}`);

    // 3. Sync to Pinecone (fire-and-forget, non-blocking)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${appUrl}/api/admin/candidates/${applicationId}/sync`, { method: 'POST' })
        .then(() => console.log(`[SYNC] Pinecone sync triggered for ${applicationId}`))
        .catch((err: Error) => console.warn(`[SYNC] Pinecone sync failed (non-fatal): ${err.message}`));

    // 4. Interview invite / status email flow
    const { sendApplicationStatusEmail } = await import('./lib/mail');
    // Read interviewEnabled from DB (already fetched above); default true for backward compat.
    const isInterviewEnabled = latestDrive?.interviewEnabled ?? true;

    if (resumeStatus === 'SHORTLISTED' && isInterviewEnabled) {
      // Voice interview is ENABLED -> create interview record and send link
      const interview = await (prisma as any).interview.upsert({
        where: { applicationId },
        update: {
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          status: "PENDING",
        },
        create: {
          applicationId,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          status: "PENDING",
        },
      });

      const interviewLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/interview/${applicationId}?token=${interview.accessToken}`;

      await sendApplicationStatusEmail({
        email: applicantEmail,
        fullName: applicantName,
        jobTitle: latestDrive?.title || drive.title,
        status: resumeStatus,
        score: currentScore,
        interviewLink
      });
      console.log(`[EMAIL] Interview invite sent to ${applicantEmail} (voice interview enabled)`);
    } else {
      // Voice interview DISABLED or candidate REJECTED -> plain status email only, no interview link
      await sendApplicationStatusEmail({
        email: applicantEmail,
        fullName: applicantName,
        jobTitle: latestDrive?.title || drive.title,
        status: resumeStatus === 'SHORTLISTED' ? 'SHORTLISTED' : 'REJECTED',
        score: currentScore
        // No interviewLink -- email reflects resume status only
      });
      console.log(`[EMAIL] Status-only email sent to ${applicantEmail} -- interview disabled: ${!isInterviewEnabled}, status: ${resumeStatus}`);
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
  stalledInterval: 60 * 1000,
  maxStalledCount: 1,
  removeOnComplete: { count: 0 }, // DELETE IMMEDIATELY ON SUCCESS
  removeOnFail: { count: 10 } // KEEP ONLY 10 FAILURES FOR DEBUGGING
});

worker.on('failed', (job, err) => {
  console.log(`[FATAL] Job ${job?.id} failed permanently: ${err.message}`);
});

/**
 * 💾 DATABASE BACKUP WORKER (Phase 5 - Persistent Backups to R2)
 * Runs daily at midnight to export core hiring data.
 */
const backupWorker = new Worker(
  "backup-queue",
  async (job) => {
    console.log(`[Backup Worker] Starting database backup to R2...`);

    try {
      // 1. Fetch data from core tables
      const users = await prisma.user.findMany();
      const drives = await prisma.drive.findMany();
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
    stalledInterval: 60 * 1000,
    maxStalledCount: 1,
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
        await (prisma as any).interview.upsert({
          where: { applicationId },
          update: updateData,
          create: {
            applicationId,
            status: interviewStatus || "IN_PROGRESS",
            ...updateData,
          },
        });
      } catch {
        await persistInterviewUpdateRaw({ applicationId, recordingUrl, transcript, interviewStatus });
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
    stalledInterval: 60 * 1000,
    maxStalledCount: 1,
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 10 }
  }
);

interviewFinalizationWorker.on("failed", (job, err) => {
  console.log(`[FATAL] Interview Finalization Job ${job?.id} failed permanently: ${err.message}`);
});

/**
 * 📸 INTERVIEW SNAPSHOT WORKER
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
      await prisma.interview.upsert({
        where: { applicationId: String(applicationId) },
        update: {
          snapshots: {
            push: url
          }
        },
        create: {
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
    removeOnComplete: { count: 0 }, // Handled by queue but double enforced
    removeOnFail: { count: 1 }
  }
);

interviewSnapshotWorker.on("failed", (job, err) => {
  console.log(`[FATAL] Snapshot Job ${job?.id} failed: ${err.message}`);
});

console.log("🚀 Workers are running and listening for jobs...");
setupCronJobs();
