/**
 * End-to-end integration test: 2 sequential resume uploads.
 * Exercises the EXACT same path as POST /api/jobs/[id]/resume-screening:
 *   R2 upload → DB row → BullMQ enqueue → worker pickup
 *
 * Worker must already be running: npm run worker
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { prisma } from '../lib/prisma';
import { putObject } from '../lib/s3';
import { generateId } from '../lib/ids';
import { resumeQueue } from '../lib/queue';

const RESUME_BUCKET = process.env.R2_RESUMES_BUCKET || 'resumes';

// -- Config ------------------------------------------------------------------
// Use the job that already exists from previous tests
const JOB_ID   = 'drv-gtm-engineer-fresher-7263';
const FILE_1     = 'C:/Users/vamsi/OneDrive/Desktop/Vamsi resume - GTM.pdf';
const FILE_2     = 'C:/Users/vamsi/OneDrive/Desktop/Files/1.pdf';
const POLL_MS    = 2_000;  // how often to check DB status
const TIMEOUT_MS = 5 * 60 * 1000; // 5 min max per job

function sanitizeFileName(n: string) { return n.replace(/[^a-zA-Z0-9._-]/g, '_'); }
function guessName(n: string) { return n.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Unknown'; }
function buildProgressState(p: number, stage: string) { return JSON.stringify({ processing: { progress: p, stage } }); }
function ts() { return new Date().toISOString(); }

async function uploadOne(label: string, filePath: string, jobRecord: any) {
  const fileName = filePath.split(/[\\/]/).pop()!;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${ts()} ▶ [UPLOAD ${label}] ${fileName}`);
  console.log('═'.repeat(60));

  // -- 1. Read file --------------------------------------------------------
  const buffer = readFileSync(filePath);
  console.log(`${ts()}   File read: ${(buffer.length / 1024).toFixed(1)} KB`);

  // -- 2. R2 upload (same as route) ---------------------------------------
  const safeName  = sanitizeFileName(fileName);
  const orgSlug   = jobRecord.organization?.urlSlug || jobRecord.orgId;
  const jobSlug = jobRecord.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const key       = `resume/${orgSlug}/${jobSlug}/${Date.now()}_0_${safeName}`;
  const uploadedUrl = await putObject(RESUME_BUCKET, key, buffer, 'application/pdf');
  console.log(`${ts()}   ✓ R2 upload → ${key}`);

  // -- 3. DB row  (same as route, resumeStatus="waiting" before enqueue) -
  const applicationId = `${generateId('app', guessName(fileName))}-${randomUUID().slice(0, 8)}`;
  await prisma.application.create({
    data: {
      id:              applicationId,
      fullName:        guessName(fileName),
      email:           '',
      phone:           '',
      resumeUrl:       uploadedUrl,
      aiScore:         0,
      aiReport:        buildProgressState(0, 'waiting'),
      resumeText:      null,
      resumeData:      JSON.stringify({ source: { bucket: RESUME_BUCKET, key } }),
      jobId:         JOB_ID,
      fileName,
      resumeStatus:    'waiting',
      interviewStatus: 'pending',
    },
  });
  console.log(`${ts()}   ✓ DB row created  applicationId="${applicationId}"  resumeStatus="waiting"`);

  // -- 4. Enqueue (same as route -- Fix #2 ties status to success) ---------
  let job: any;
  try {
    job = await resumeQueue.add(
      'screen-resume',
      { applicationId, bucket: RESUME_BUCKET, key, fileName, orgId: jobRecord.orgId },
      { attempts: 2, backoff: { type: 'exponential', delay: 5000 } }
    );
    console.log(`${ts()}   ✓ Enqueued  job.id="${job.id}"  applicationId="${applicationId}"`);
  } catch (e: any) {
    // Fix #2: flip status to "failed" if enqueue itself fails
    await prisma.application.update({
      where: { id: applicationId },
      data: { resumeStatus: 'failed', aiReport: buildProgressState(0, 'failed'), updatedAt: new Date() },
    });
    throw new Error(`Enqueue failed — row marked "failed": ${e.message}`);
  }

  // -- 5. Poll DB until terminal state ------------------------------------
  console.log(`${ts()}   ⏳ Waiting for worker to process job.id="${job.id}" …`);
  const deadline = Date.now() + TIMEOUT_MS;
  const TERMINAL = new Set(['pending', 'failed', 'shortlisted', 'rejected']);
  const IN_PROGRESS = new Set(['waiting', 'processing', 'extracting', 'scoring', 'starting']);
  let lastStatus = 'waiting';

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS));
    const row = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { resumeStatus: true, aiScore: true },
    });
    const status = row?.resumeStatus || 'unknown';
    if (status !== lastStatus) {
      console.log(`${ts()}   📊 Status changed: "${lastStatus}" → "${status}"  aiScore=${row?.aiScore ?? 'n/a'}`);
      lastStatus = status;
    }
    if (TERMINAL.has(status)) {
      console.log(`${ts()}   ✅ DONE  applicationId="${applicationId}"  finalStatus="${status}"  aiScore=${row?.aiScore}`);
      return { applicationId, status, aiScore: row?.aiScore };
    }
    if (!IN_PROGRESS.has(status)) {
      console.log(`${ts()}   ⚠ Unexpected status "${status}" — treating as done`);
      return { applicationId, status, aiScore: row?.aiScore };
    }
  }
  throw new Error(`TIMEOUT after ${TIMEOUT_MS / 1000}s — last status="${lastStatus}" for ${applicationId}`);
}

async function main() {
  console.log(`\n${'▓'.repeat(60)}`);
  console.log('  RESUME UPLOAD E2E TEST — 2 sequential files');
  console.log(`${'▓'.repeat(60)}`);

  // Pre-check: worker must be up
  const { createRedisConnection, getBullPrefix } = await import('../lib/redis');
  const checkConn = createRedisConnection();
  const checkQ = new Queue('resume-processing', { connection: checkConn, prefix: getBullPrefix() });
  await checkQ.waitUntilReady();
  const workers = await checkQ.getWorkers();
  console.log(`\n${ts()} Workers on "resume-processing": ${workers.length}`);
  for (const w of workers) {
    const age = Number((w as any).age || 0);
    const flag = age > 3600 ? ' ← ⚠ GHOST (>1h old)' : '';
    console.log(`  addr=${(w as any).addr}  age=${age}s${flag}`);
  }
  if (workers.length === 0) {
    throw new Error('No worker connected — run "npm run worker" first');
  }

  // Initial queue state
  const counts = await checkQ.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  console.log(`${ts()} Queue state before test: ${JSON.stringify(counts)}`);
  await checkQ.close();
  await checkConn.quit();

  const job = await prisma.job.findUnique({
    where: { id: JOB_ID },
    select: { id: true, title: true, orgId: true, organization: { select: { urlSlug: true } } },
  });
  if (!job) throw new Error(`Job ${JOB_ID} not found`);
  console.log(`${ts()} Job: "${job.title}" (${job.id})`);

  // -- Upload 1 ------------------------------------------------------------
  const result1 = await uploadOne('1/2', FILE_1, job);

  // -- Upload 2 ------------------------------------------------------------
  const result2 = await uploadOne('2/2', FILE_2, job);

  // -- Final summary -------------------------------------------------------
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  FINAL RESULTS');
  console.log('═'.repeat(60));
  console.log(`Upload 1: ${result1.status.toUpperCase().padEnd(8)}  aiScore=${result1.aiScore}  id=${result1.applicationId}`);
  console.log(`Upload 2: ${result2.status.toUpperCase().padEnd(8)}  aiScore=${result2.aiScore}  id=${result2.applicationId}`);

  const allPassed = [result1, result2].every(r => r.status !== 'waiting' && r.status !== 'failed');
  console.log(`\n${allPassed ? '🟢 ALL PASSED' : '🔴 SOME FAILED'}`);

  await prisma.$disconnect();
  process.exit(allPassed ? 0 : 1);
}

main().catch(async (e) => {
  console.error(`\n❌ TEST FATAL: ${e.message}`);
  await prisma.$disconnect();
  process.exit(1);
});
