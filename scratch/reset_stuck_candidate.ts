/**
 * reset_stuck_candidate.ts
 * Resets any candidates/applications stuck in "processing/waiting" state
 * and re-queues the batch so the worker can retry with the fixed Python code.
 *
 * Run: npx tsx scratch/reset_stuck_candidate.ts
 */
import { prisma } from '../lib/prisma';
import { Queue } from 'bullmq';
import redisConnection from '../lib/redis';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('\n=== Stuck Candidate Reset Tool ===\n');

  // 1. Find all applications stuck in processing/waiting state
  const stuckApps = await prisma.application.findMany({
    where: {
      OR: [
        { resumeStatus: 'processing' },
        { resumeStatus: 'waiting' },
        { resumeStatus: 'failed' },
      ],
    },
    select: {
      id: true,
      fullName: true,
      resumeStatus: true,
      driveId: true,
      aiReport: true,
    },
  });

  console.log(`Found ${stuckApps.length} stuck application(s):`);
  stuckApps.forEach(a => console.log(`  - ${a.fullName} (${a.id}) status=${a.resumeStatus}`));

  if (stuckApps.length === 0) {
    console.log('No stuck applications found. Checking ResumeCandidates...');
  }

  // 2. Find all stuck ResumeCandidates
  const stuckCandidates = await prisma.resumeCandidate.findMany({
    where: {
      OR: [
        { resumeStatus: 'processing' },
        { resumeStatus: 'waiting' },
        { resumeStatus: 'failed' },
      ],
    },
    select: {
      id: true,
      fullName: true,
      resumeStatus: true,
      bulkBatchId: true,
    },
  });

  console.log(`Found ${stuckCandidates.length} stuck ResumeCandidates(s):`);
  stuckCandidates.forEach(c => console.log(`  - ${c.fullName} (${c.id}) batchId=${c.bulkBatchId} status=${c.resumeStatus}`));

  // 3. Reset all stuck Applications back to "pending"
  if (stuckApps.length > 0) {
    await prisma.application.updateMany({
      where: {
        id: { in: stuckApps.map(a => a.id) },
      },
      data: {
        resumeStatus: 'pending',
        aiScore: 0,
        aiReport: null,
      },
    });
    console.log(`\n✅ Reset ${stuckApps.length} application(s) to "pending"`);
  }

  // 4. Reset all stuck ResumeCandidates back to "pending"
  if (stuckCandidates.length > 0) {
    await prisma.resumeCandidate.updateMany({
      where: {
        id: { in: stuckCandidates.map(c => c.id) },
      },
      data: {
        resumeStatus: 'pending',
        aiScore: 0,
        aiReport: null,
      },
    });
    console.log(`✅ Reset ${stuckCandidates.length} ResumeCandidates(s) to "pending"`);
  }

  // 5. Find the batches that need re-queuing
  const batchIds = [...new Set(stuckCandidates.map(c => c.bulkBatchId).filter(Boolean))] as string[];
  console.log(`\nBatches to re-queue: ${batchIds.join(', ') || 'none'}`);

  if (batchIds.length > 0) {
    // Reset batch status too
    await prisma.resumeBatch.updateMany({
      where: { id: { in: batchIds } },
      data: { status: 'PENDING', processedCount: 0, failedCount: 0 },
    });

    // Re-enqueue each batch
    const resumeQueue = new Queue('resume-processing', { connection: redisConnection });

    for (const batchId of batchIds) {
      const batch = await prisma.resumeBatch.findUnique({
        where: { id: batchId },
        select: { id: true, driveId: true, orgId: true },
      });

      if (!batch) {
        console.warn(`  ⚠️ Batch ${batchId} not found in DB, skipping re-queue`);
        continue;
      }

      await resumeQueue.add(
        'drive-resume-batch',
        { batchId: batch.id, driveId: batch.driveId, orgId: batch.orgId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        }
      );
      console.log(`  ✅ Re-queued batch ${batchId} for drive ${batch.driveId}`);
    }

    await resumeQueue.close();
  }

  console.log('\n=== Done. Worker will now pick up the reset jobs. ===\n');
}

main()
  .catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
