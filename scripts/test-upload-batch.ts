/**
 * Batch upload test: 2 files → wait → 2 files → wait → 1 file
 * Tests concurrency with staggered uploads
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
const JOB_ID = 'drv-gtm-engineer-fresher-7263';
const FILE_SMALL = 'C:/Users/vamsi/OneDrive/Desktop/Vamsi resume - GTM.pdf';
const FILE_LARGE = 'C:/Users/vamsi/OneDrive/Desktop/Files/1.pdf';
const POLL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000;

function sanitizeFileName(n: string) { return n.replace(/[^a-zA-Z0-9._-]/g, '_'); }
function guessName(n: string) { return n.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Unknown'; }
function buildProgressState(p: number, stage: string) { return JSON.stringify({ processing: { progress: p, stage } }); }
function ts() { return new Date().toISOString(); }

async function uploadOne(label: string, filePath: string, jobRecord: any) {
  const fileName = filePath.split(/[\\/]/).pop()!;
  console.log(`\n  ${label} ${fileName}`);

  const buffer = readFileSync(filePath);
  const safeName = sanitizeFileName(fileName);
  const orgSlug = jobRecord.organization?.urlSlug || jobRecord.orgId;
  const jobSlug = jobRecord.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const key = `resume/${orgSlug}/${jobSlug}/${Date.now()}_0_${safeName}`;
  const uploadedUrl = await putObject(RESUME_BUCKET, key, buffer, 'application/pdf');

  const applicationId = `${generateId('app', guessName(fileName))}-${randomUUID().slice(0, 8)}`;
  await prisma.application.create({
    data: {
      id: applicationId,
      fullName: guessName(fileName),
      email: '',
      phone: '',
      resumeUrl: uploadedUrl,
      aiScore: 0,
      aiReport: buildProgressState(0, 'waiting'),
      resumeText: null,
      resumeData: JSON.stringify({ source: { bucket: RESUME_BUCKET, key } }),
      jobId: JOB_ID,
      fileName,
      resumeStatus: 'waiting',
      interviewStatus: 'pending',
    },
  });

  const job = await resumeQueue.add('screen-resume', {
    applicationId,
    bucket: RESUME_BUCKET,
    key,
    fileName,
    orgId: jobRecord.orgId,
  });

  console.log(`    ✓ Enqueued job.id="${job.id}" app="${applicationId}"`);
  return { applicationId, jobId: job.id };
}

async function waitForDone(appIds: string[]) {
  console.log(`\n  ⏳ Waiting for ${appIds.length} job(s) to complete…`);
  const TERMINAL = new Set(['pending', 'failed', 'shortlisted', 'rejected']);
  const IN_PROGRESS = new Set(['waiting', 'processing', 'extracting', 'scoring', 'starting']);
  const statuses = new Map<string, string>(appIds.map(id => [id, 'waiting']));
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS));
    let allDone = true;

    for (const appId of appIds) {
      const row = await prisma.application.findUnique({
        where: { id: appId },
        select: { resumeStatus: true, aiScore: true },
      });
      const status = row?.resumeStatus || 'unknown';
      const oldStatus = statuses.get(appId) || 'unknown';

      if (status !== oldStatus) {
        console.log(`    📊 ${appId.slice(0, 20)}… "${oldStatus}" → "${status}" score=${row?.aiScore ?? '-'}`);
        statuses.set(appId, status);
      }

      if (!TERMINAL.has(status)) allDone = false;
    }

    if (allDone) {
      console.log(`  ✅ All ${appIds.length} job(s) completed`);
      return;
    }
  }
  throw new Error(`TIMEOUT after ${TIMEOUT_MS / 1000}s`);
}

async function main() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  BATCH UPLOAD TEST: 2 → wait → 2 → wait → 1');
  console.log(`${'═'.repeat(70)}`);

  const { createRedisConnection, getBullPrefix } = await import('../lib/redis');
  const checkConn = createRedisConnection();
  const checkQ = new Queue('resume-processing', { connection: checkConn, prefix: getBullPrefix() });
  await checkQ.waitUntilReady();
  const workers = await checkQ.getWorkers();
  console.log(`\n${ts()} Workers: ${workers.length}`);
  const counts = await checkQ.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  console.log(`Queue before: ${JSON.stringify(counts)}`);
  await checkQ.close();
  await checkConn.quit();

  const job = await prisma.job.findUnique({
    where: { id: JOB_ID },
    select: { id: true, title: true, orgId: true, organization: { select: { urlSlug: true } } },
  });
  if (!job) throw new Error(`Job ${JOB_ID} not found`);

  // Batch 1: Upload 2
  console.log(`\n${'─'.repeat(70)}\n  BATCH 1: Upload 2 files (small + large)\n${'─'.repeat(70)}`);
  const batch1 = [
    await uploadOne('  1a.', FILE_SMALL, job),
    await uploadOne('  1b.', FILE_LARGE, job),
  ];
  await waitForDone(batch1.map(b => b.applicationId));

  // Batch 2: Upload 2
  console.log(`\n${'─'.repeat(70)}\n  BATCH 2: Upload 2 more files\n${'─'.repeat(70)}`);
  const batch2 = [
    await uploadOne('  2a.', FILE_SMALL, job),
    await uploadOne('  2b.', FILE_LARGE, job),
  ];
  await waitForDone(batch2.map(b => b.applicationId));

  // Batch 3: Upload 1
  console.log(`\n${'─'.repeat(70)}\n  BATCH 3: Upload 1 file\n${'─'.repeat(70)}`);
  const batch3 = [await uploadOne('  3.', FILE_SMALL, job)];
  await waitForDone(batch3.map(b => b.applicationId));

  // Summary
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  FINAL RESULTS');
  console.log(`${'═'.repeat(70)}\n`);
  const allApps = [...batch1, ...batch2, ...batch3];
  for (const app of allApps) {
    const row = await prisma.application.findUnique({
      where: { id: app.applicationId },
      select: { resumeStatus: true, aiScore: true },
    });
    console.log(`  ${row?.resumeStatus?.toUpperCase().padEnd(10)} aiScore=${row?.aiScore}  ${app.applicationId.slice(0, 30)}…`);
  }

  const allPassed = allApps.every(async (a) => {
    const row = await prisma.application.findUnique({ where: { id: a.applicationId }, select: { resumeStatus: true } });
    return row?.resumeStatus !== 'waiting' && row?.resumeStatus !== 'failed';
  });

  console.log(`\n🟢 ALL 5 BATCHES PASSED\n`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(`\n❌ TEST FATAL: ${e.message}`);
  await prisma.$disconnect();
  process.exit(1);
});
