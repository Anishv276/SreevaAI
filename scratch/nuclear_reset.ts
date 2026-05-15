/**
 * nuclear_reset.ts
 * Completely obliterates the resume-processing queue and adds ONLY the fresh batch.
 * Run this, then restart the worker.
 */
import { prisma } from '../lib/prisma';
import { Queue } from 'bullmq';
import redisConnection from '../lib/redis';
import * as dotenv from 'dotenv';
dotenv.config();

// The ONLY batch we want to process — the freshest upload with a valid R2 key
const FRESH_BATCH_ID = 'cmp75rbpx000lgguo307vrlyk';

async function main() {
  console.log('\n=== Nuclear Queue Reset ===\n');

  const resumeQueue = new Queue('resume-processing', { connection: redisConnection });

  // 1. Obliterate the entire queue (removes all jobs regardless of state)
  try {
    await (resumeQueue as any).obliterate({ force: true });
    console.log('✅ Queue obliterated — all jobs cleared');
  } catch (e) {
    console.warn('obliterate failed, trying manual clean...');
    await resumeQueue.drain(true);
    await resumeQueue.clean(0, 1000, 'wait');
    await resumeQueue.clean(0, 1000, 'active');
    await resumeQueue.clean(0, 1000, 'failed');
    await resumeQueue.clean(0, 1000, 'delayed');
    await resumeQueue.clean(0, 1000, 'completed');
    console.log('✅ Queue manually cleaned');
  }

  // 2. Mark ALL old stuck batches (everything except the fresh one) as permanently FAILED
  const purged = await prisma.resumeBatch.updateMany({
    where: {
      id: { not: FRESH_BATCH_ID },
      status: { in: ['PROCESSING', 'PENDING', 'QUEUED', 'FAILED'] },
    },
    data: { status: 'FAILED' },
  });
  console.log(`✅ Marked ${purged.count} old batch(es) as FAILED`);

  // 3. Mark old stuck candidates as permanently failed
  const oldCandidates = await prisma.resumeCandidate.updateMany({
    where: {
      bulkBatchId: { not: FRESH_BATCH_ID },
      resumeStatus: { in: ['processing', 'waiting', 'pending', 'failed'] },
    },
    data: {
      resumeStatus: 'failed',
      aiReport: JSON.stringify({ processing: { stage: 'failed', progress: 0, error: 'Stale R2 key — batch purged' } }),
    },
  });
  console.log(`✅ Marked ${oldCandidates.count} old candidate(s) as failed`);

  // 4. Mark old applications as failed
  const oldApps = await prisma.application.updateMany({
    where: {
      resumeStatus: { in: ['processing', 'waiting', 'pending'] },
      // Exclude the fresh batch's application
      NOT: { resumeData: { contains: FRESH_BATCH_ID } },
    },
    data: {
      resumeStatus: 'failed',
      aiReport: JSON.stringify({ processing: { stage: 'failed', progress: 0, error: 'Stale batch purged' } }),
    },
  });
  console.log(`✅ Marked ${oldApps.count} old application(s) as failed`);

  // 5. Reset the fresh batch + candidates to pending
  const freshBatch = await prisma.resumeBatch.findUnique({ where: { id: FRESH_BATCH_ID } });
  if (!freshBatch) {
    console.error(`❌ Fresh batch ${FRESH_BATCH_ID} not found in DB!`);
    await resumeQueue.close();
    return;
  }

  await prisma.resumeBatch.update({
    where: { id: FRESH_BATCH_ID },
    data: { status: 'PENDING', processedCount: 0, failedCount: 0 },
  });

  await prisma.resumeCandidate.updateMany({
    where: { bulkBatchId: FRESH_BATCH_ID },
    data: { resumeStatus: 'waiting', aiScore: 0, aiReport: JSON.stringify({ processing: { stage: 'waiting', progress: 0 } }) },
  });

  // Reset application linked to fresh batch
  await prisma.application.updateMany({
    where: { resumeData: { contains: FRESH_BATCH_ID } },
    data: {
      resumeStatus: 'waiting',
      aiScore: 0,
      aiReport: JSON.stringify({ processing: { stage: 'waiting', progress: 0 } }),
    },
  });

  console.log(`✅ Fresh batch ${FRESH_BATCH_ID} reset to PENDING`);

  // 6. Add ONLY the fresh batch to the clean queue
  await resumeQueue.add(
    'drive-resume-batch',
    { batchId: freshBatch.id, driveId: freshBatch.driveId, orgId: freshBatch.orgId },
    {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );
  console.log(`✅ Fresh batch queued — drive: ${freshBatch.driveId}`);

  await resumeQueue.close();
  console.log('\n=== Done. Now restart the worker with: npm run worker ===\n');
}

main()
  .catch(e => { console.error('FATAL:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
