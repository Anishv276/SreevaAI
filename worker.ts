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

  await prisma.$executeRawUnsafe(
    `
    UPDATE "Assessment"
    SET
      "interviewRecordingUrl" = COALESCE($1, "interviewRecordingUrl"),
      "interviewRecordedAt" = CASE WHEN $1 IS NOT NULL THEN NOW() ELSE "interviewRecordedAt" END,
      "interviewTranscript" = COALESCE($2, "interviewTranscript"),
      status = COALESCE($3, status),
      "completedAt" = CASE WHEN $3 = 'COMPLETED' THEN NOW() ELSE "completedAt" END,
      "updatedAt" = NOW()
    WHERE "applicationId" = $4
    `,
    recordingUrl || null,
    transcript || null,
    interviewStatus || null,
    applicationId
  );
}

const redisConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

console.log('🚀 Worker started: Awaiting jobs...');

const worker = new Worker('resume-processing', async (job) => {
  const { applicationId, resumeText: initialResumeText, resumeUrl, jdText, drive, applicantEmail, applicantName, structuredResume: initialStructuredResume } = job.data;
  
  console.log(`[JOB] Processing application ${applicationId} for ${applicantEmail}`);

  // Guard: skip if the application record was deleted
  const appExists = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!appExists) {
    console.warn(`[JOB] Application ${applicationId} no longer exists. Discarding stale job.`);
    return;
  }
  
  let resumeText = initialResumeText || "";
  let tempResumePath: string | null = null;
  let tempInputPath: string | null = null;


  try {
    // 1. EXTRACT STRUCTURED DATA (Always do this to ensure we have the latest schema)
    console.log(`[JOB] Extracting structured resume data...`);
    
    // Check if resumeUrl is a valid HTTP(S) URL
    const isRemoteUrl = typeof resumeUrl === 'string' && (resumeUrl.startsWith('http://') || resumeUrl.startsWith('https://'));
    console.log(`[JOB] resumeUrl: "${resumeUrl}", isRemoteUrl: ${isRemoteUrl}`);

    if (isRemoteUrl && !tempResumePath) {
      tempResumePath = join(tmpdir(), `resume_${applicationId}_${Date.now()}.pdf`);
      // Re-download or use existing URL if we don't have a local path
      try {
        console.log(`[JOB] Fetching remote resume from: ${resumeUrl}`);
        const response = await fetch(resumeUrl);
        if (!response.ok) throw new Error(`Failed to fetch resume: ${response.statusText}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        await writeFile(tempResumePath, buffer);
      } catch (fetchErr) {
        console.warn(`[JOB] Could not download resume from ${resumeUrl}:`, fetchErr);
        tempResumePath = null;
      }
    }
    
    let structuredResume = initialStructuredResume || {};

    if (Object.keys(structuredResume).length > 0) {
      console.log(`[JOB] Found pre-extracted structuredResume in DB/job data. Skipping PDF/text extraction.`);
    } else {
      // If no remote URL (mock or manual entry) but we have resumeText, process it as a .txt file
      if (!tempResumePath && resumeText) {
        tempResumePath = join(tmpdir(), `resume_${applicationId}_${Date.now()}.txt`);
        await writeFile(tempResumePath, resumeText);
        console.log(`[JOB] Saved resumeText to temporary .txt file for structured extraction.`);
      }

      if (tempResumePath) {
        const extractProcess = spawn(pythonCmd, ["scripts/extract_pdf.py", tempResumePath, "RESUME"]);

        let extractionOutput = "";
        await new Promise((resolve, reject) => {
          extractProcess.stdout.on("data", (data) => { extractionOutput += data.toString(); });
          extractProcess.on("close", (code) => {
            if (code !== 0) reject(new Error(`Extraction failed with code ${code}: ${extractionOutput}`));
            else resolve(null);
          });
        });

        try {
          const parsedExtraction = JSON.parse(extractionOutput);
          resumeText = parsedExtraction.text || resumeText;
          structuredResume = parsedExtraction.data || {};
        } catch (parseErr) {
          console.error(`[JOB] Failed to parse extraction output:`, parseErr);
          console.error(`[JOB] Output was: ${extractionOutput}`);
        }
      } else {
        console.log(`[JOB] No PDF file or resume text available for extraction. Using empty structured data.`);
      }
    }

    // Update the DB with the latest structured data
    await (prisma.application as any).update({
      where: { id: applicationId },
      data: { 
        resumeText: resumeText || "",
        structuredResume: JSON.stringify(structuredResume || {}),
        experienceYears: (structuredResume as any)?.experience?.total_years || null,
        relevantYears: (structuredResume as any)?.experience?.relevant_years || null,
      }
    });

    // 2. SCORING (Structured JD vs Structured Resume)
    console.log(`[JOB] Scoring candidate ${applicantEmail} using Structured Data...`);
    let aiResult = { score: 0, status: "Pending", reasoning: "No resume data" };
    const THRESHOLD = drive.screeningThreshold || 70;
    
    // Parse JD details if stored as string
    const jdDetails = typeof (drive as any).extractedDetails === 'string' 
      ? JSON.parse((drive as any).extractedDetails) 
      : (drive as any).extractedDetails || {};

    const scoringInput = { 
        resume: structuredResume, 
        jd: jdDetails 
    };

    tempInputPath = join(tmpdir(), `scoring_${Date.now()}_${Math.random().toString(36).substring(7)}.json`);
    await writeFile(tempInputPath, JSON.stringify(scoringInput));
    
    const pythonProcess = spawn(pythonCmd, ["scripts/extract_pdf.py", tempInputPath, "SCORE"]);

    let outputData = "";
    let errorData = "";

    await new Promise((resolve, reject) => {
      pythonProcess.stdout.on("data", (data) => { outputData += data.toString(); });
      pythonProcess.stderr.on("data", (data) => { errorData += data.toString(); });
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
    const finalStatus = aiResult.status || (currentScore >= THRESHOLD ? "Shortlisted" : "Rejected");

    // 2. Update DB
    const exists = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!exists) {
      console.warn(`[JOB] Application ${applicationId} no longer exists. Skipping update.`);
      return;
    }
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: finalStatus,
        aiScore: currentScore,
        aiReport: JSON.stringify(aiResult),
      }
    });

    console.log(`[SUCCESS] Candidate ${applicantEmail} scored ${currentScore}. Status: ${finalStatus}`);

    // 3. Email & Assessment Logic (Dynamic imports because they are Next.js modules)
    // In a worker, we often use direct imports if possible.
    const { sendApplicationStatusEmail } = await import('./lib/mail');
    if (finalStatus === 'ACCEPTED' || finalStatus === 'Shortlisted') {
      // 3. STATIC ASSESSMENT GENERATION (DISABLED: Pivoting to purely Voice Interview)
      /* 
      const { generatePersonalizedAssessment } = await import('./lib/ai-assessment');
      const questions = await generatePersonalizedAssessment({
        resumeData: typeof structuredResume === 'string' ? JSON.parse(structuredResume) : structuredResume,
        jdData: jdDetails,
        count: drive.assessmentCount,
        difficulty: drive.assessmentDifficulty,
        types: drive.assessmentTypes
      });
      */
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

      const interviewLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/careers/interview/${applicationId}?token=${interview.accessToken}`;

      await sendApplicationStatusEmail({
        email: applicantEmail,
        fullName: applicantName,
        jobTitle: drive.title,
        status: 'ACCEPTED', 
        score: currentScore,
        assessmentLink: interviewLink // Renamed to clarify it's an interview
      });
    } else {
      await sendApplicationStatusEmail({
        email: applicantEmail,
        fullName: applicantName,
        jobTitle: drive.title,
        status: 'REJECTED',
        score: currentScore
      });
    }

  } catch (error) {
    console.error(`[ERROR] Job ${job.id} failed:`, error);
    if (tempResumePath) await unlink(tempResumePath).catch(() => {});
    if (tempInputPath) await unlink(tempInputPath).catch(() => {});

    throw error; // Rethrow so BullMQ knows it failed and can retry
  }
}, { 
  connection: redisConnection,
  concurrency: 2, // Only process 2 resumes at a time to prevent CPU spikes
  lockDuration: 60000, // Increase lock duration to 60s for long AI tasks
  removeOnComplete: { count: 0 }, // DELETE IMMEDIATELY ON SUCCESS
  removeOnFail: { count: 10 } // KEEP ONLY 10 FAILURES FOR DEBUGGING
});

worker.on('failed', (job, err) => {
  console.log(`[FATAL] Job ${job?.id} failed permanently: ${err.message}`);
});

/**
 * 2. ASSESSMENT GRADING WORKER
 * Triggered after a candidate submits their test.
 */
const gradingWorker = new Worker('assessment-grading', async (job) => {
  const { assessmentId, questions, startedAt, completedAt, jdText } = job.data;
  const { gradeAssessment } = await import('./lib/ai-grader');

  console.log(`[JOB] Grading assessment ${assessmentId}`);

  // Guard: skip if the assessment record was deleted or already graded
  const assessmentExists = await (prisma as any).assessment.findUnique({ 
    where: { id: assessmentId },
    select: { aiReport: true } 
  });
  
  if (!assessmentExists) {
    console.warn(`[JOB] Assessment ${assessmentId} no longer exists. Discarding stale job.`);
    return;
  }

  if (assessmentExists.aiReport) {
    console.log(`[JOB] Assessment ${assessmentId} already has an AI report. Skipping redundant grading.`);
    return;
  }

  try {
    const report = await gradeAssessment({
      questions,
      startedAt: new Date(startedAt),
      completedAt: new Date(completedAt),
      jdText
    });

    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { aiReport: JSON.stringify(report) }
    });

    console.log(`[SUCCESS] Assessment ${assessmentId} graded. Score: ${report.overallScore}`);
    return { success: true, aiReport: report }; // Changed from result.aiReport to report
  } catch (error) {
    console.error(`[Grading Worker Error]:`, error);
    throw error;
  }
}, { 
  connection: redisConnection,
  concurrency: 2,
  lockDuration: 60000, 
  removeOnComplete: { count: 0 },
  removeOnFail: { count: 10 }
});

gradingWorker.on('failed', (job, err) => {
  console.log(`[FATAL] Grading Job ${job?.id} failed permanently: ${err.message}`);
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
      const assessments = await (prisma as any).assessment.findMany(); // Using any for Phase 4 fields

      const backupData = {
        metadata: {
          timestamp: new Date().toISOString(),
          version: "1.0",
        },
        users,
        drives,
        applications,
        assessments
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
  { connection: redisConnection }
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
 * 💾 PROCTORING EVENT BATCHER
 * Receives batches of security flags and flushes them to the DB atomically.
 */
const proctoringBatchWorker = new Worker(
  "proctoring-events",
  async (job) => {
    const { assessmentId, events } = job.data;
    console.log(`[JOB] Batching ${events.length} proctoring events for assessment ${assessmentId}`);

    try {
      // 1. Bulk insert events
      // @ts-ignore
      await (prisma as any).proctoringEvent.createMany({
        data: events.map((e: any) => ({
          assessmentId,
          eventType: e.eventType,
          severity: e.severity,
          reason: e.reason,
          durationSeconds: e.durationSeconds,
          metadata: e.metadata,
          timestamp: new Date(e.timestamp),
        })),
      });

      // 2. Aggregate summary data (e.g., total tab switches in this batch)
      const tabSwitches = events.filter((e: any) => e.eventType === "TabSwitch").length;
      if (tabSwitches > 0) {
        // @ts-ignore
        await (prisma as any).assessment.update({
          where: { id: assessmentId },
          data: { tabSwitchCount: { increment: tabSwitches } }
        });
      }

      console.log(`[SUCCESS] Archived ${events.length} events for ${assessmentId}`);
      return { success: true, count: events.length };
    } catch (error) {
      console.error(`[Proctoring Batch Error]:`, error);
      throw error;
    }
  },
  { connection: redisConnection }
);

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
          'UPDATE "Application" SET status = $1, "updatedAt" = NOW() WHERE id = $2',
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
    concurrency: 4, 
    lockDuration: 60000,
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 10 }
  }
);

interviewFinalizationWorker.on("failed", (job, err) => {
  console.log(`[FATAL] Interview Finalization Job ${job?.id} failed permanently: ${err.message}`);
});

console.log("🚀 Workers are running and listening for jobs...");
setupCronJobs();
