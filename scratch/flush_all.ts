/**
 * flush_all.ts — Wipes entire Redis DB and marks all in-flight candidates as failed.
 * Run this to start 100% fresh with no stale state.
 */
import { prisma } from '../lib/prisma';
import redisConnection from '../lib/redis';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('\n=== Full Redis Flush + DB Reset ===\n');

  // 1. FLUSH entire Redis DB (removes ALL keys, not just BullMQ)
  await redisConnection.connect().catch(() => {});
  try {
    const result = await redisConnection.flushdb();
    console.log('✅ Redis FLUSHDB:', result);
  } catch (e: any) {
    console.warn('⚠️  FLUSHDB failed (may need admin rights):', e.message);
    // Fallback: delete bull: keys manually
    const keys = await redisConnection.keys('bull:*');
    if (keys.length > 0) {
      await redisConnection.del(...keys);
      console.log(`✅ Deleted ${keys.length} BullMQ keys manually`);
    } else {
      console.log('ℹ️  No BullMQ keys found to delete');
    }
  }

  // 2. Mark ALL stuck batches as failed in DB
  const batches = await prisma.resumeBatch.updateMany({
    where: { status: { in: ['PROCESSING', 'PENDING', 'QUEUED', 'FAILED'] } },
    data: { status: 'FAILED', processedCount: 0, failedCount: 0 },
  });
  console.log(`✅ Reset ${batches.count} batch(es) → FAILED`);

  // 3. Mark ALL stuck candidates as failed
  const candidates = await prisma.resumeCandidate.updateMany({
    where: { resumeStatus: { in: ['waiting', 'processing', 'pending', 'failed'] } },
    data: {
      resumeStatus: 'failed',
      aiReport: JSON.stringify({ processing: { stage: 'failed', progress: 0, error: 'Manual flush — re-upload to process' } }),
    },
  });
  console.log(`✅ Reset ${candidates.count} candidate(s) → failed`);

  // 4. Mark ALL stuck applications as failed
  const apps = await prisma.application.updateMany({
    where: { resumeStatus: { in: ['waiting', 'processing', 'pending'] } },
    data: {
      resumeStatus: 'failed',
      aiReport: JSON.stringify({ processing: { stage: 'failed', progress: 0, error: 'Manual flush — re-upload to process' } }),
    },
  });
  console.log(`✅ Reset ${apps.count} application(s) → failed`);

  console.log('\n=== Done. Redis is clean. Re-upload a resume to start fresh. ===\n');
}

main()
  .catch(e => { console.error('FATAL:', e); process.exit(1); })
  .finally(async () => {
    await redisConnection.quit().catch(() => {});
    await prisma.$disconnect();
  });
