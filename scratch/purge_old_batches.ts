/**
 * purge_old_batches.ts
 * Purges stale BullMQ jobs (whose R2 keys no longer exist) and keeps only fresh batches.
 * Run: npx tsx scratch/purge_old_batches.ts
 */
import { prisma } from '../lib/prisma';
import { Queue } from 'bullmq';
import redisConnection from '../lib/redis';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('\n=== Purge Old Batches Tool ===\n');

  const resumeQueue = new Queue('resume-processing', { connection: redisConnection });

  // 1. Drain ALL waiting jobs from the queue (clear the backlog)
  const drained = await resumeQueue.drain();
  console.log(`Drained queue. (${drained} waiting jobs removed)`);

  // 2. Also clean failed jobs
  await resumeQueue.clean(0, 100, 'failed');
  console.log('Cleaned failed jobs from queue.');

  // 3. Mark old batches as permanently failed in DB (older than 2 hours)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const oldBatches = await prisma.resumeBatch.updateMany({
    where: {
      status: { in: ['PROCESSING', 'PENDING', 'QUEUED', 'FAILED'] },
      createdAt: { lt: twoHoursAgo },
    },
    data: { status: 'FAILED' },
  });
  console.log(`Marked ${oldBatches.count} old batch(es) as permanently FAILED`);

  // 4. Mark old stuck candidates as permanently failed
  const oldCandidates = await prisma.resumeCandidate.updateMany({
    where: {
      resumeStatus: { in: ['processing', 'waiting', 'pending', 'failed'] },
      createdAt: { lt: twoHoursAgo },
    },
    data: {
      resumeStatus: 'failed',
      aiReport: JSON.stringify({ processing: { stage: 'failed', progress: 0, error: 'R2 key no longer exists — stale batch purged' } }),
    },
  });
  console.log(`Marked ${oldCandidates.count} old candidate(s) as permanently failed`);

  // 5. Also mark old applications as failed
  const oldApps = await prisma.application.updateMany({
    where: {
      resumeStatus: { in: ['processing', 'waiting', 'pending'] },
      createdAt: { lt: twoHoursAgo },
    },
    data: {
      resumeStatus: 'failed',
      aiReport: JSON.stringify({ processing: { stage: 'failed', progress: 0, error: 'Stale batch purged' } }),
    },
  });
  console.log(`Marked ${oldApps.count} old application(s) as failed`);

  // 6. Find FRESH batches (last 2 hours) that should still be processed
  const freshBatches = await prisma.resumeBatch.findMany({
    where: {
      createdAt: { gte: twoHoursAgo },
      status: { in: ['QUEUED', 'PENDING', 'FAILED'] },
    },
    select: { id: true, driveId: true, orgId: true, status: true, createdAt: true },
  });

  console.log(`\nFound ${freshBatches.length} fresh batch(es) to re-queue:`);
  for (const batch of freshBatches) {
    console.log(`  - ${batch.id} (drive: ${batch.driveId}, created: ${batch.createdAt.toISOString()})`);

    // Reset batch to PENDING
    await prisma.resumeBatch.update({
      where: { id: batch.id },
      data: { status: 'PENDING', processedCount: 0, failedCount: 0 },
    });

    // Reset fresh candidates
    await prisma.resumeCandidate.updateMany({
      where: { bulkBatchId: batch.id },
      data: { resumeStatus: 'pending', aiScore: 0, aiReport: null },
    });

    // Re-queue
    await resumeQueue.add(
      'drive-resume-batch',
      { batchId: batch.id, driveId: batch.driveId, orgId: batch.orgId },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );
    console.log(`  ✅ Re-queued batch ${batch.id}`);
  }

  if (freshBatches.length === 0) {
    console.log('  No fresh batches found. Please re-upload the resume.');
  }

  await resumeQueue.close();
  console.log('\n=== Done. Restart the worker now. ===\n');
}

main()
  .catch(e => { console.error('FATAL:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
