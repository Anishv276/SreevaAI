import 'dotenv/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

async function main() {
  const redis = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const queue = new Queue('resume-processing', { connection: redis });

  await queue.waitUntilReady();

  const counts = await queue.getJobCounts(
    'waiting', 'active', 'delayed', 'failed', 'completed', 'paused', 'waiting-children'
  );
  console.log(`\n=== resume-processing queue counts ===`);
  console.log(JSON.stringify(counts, null, 2));

  const isPaused = await queue.isPaused();
  console.log(`Paused: ${isPaused}`);

  const failed = await queue.getFailed(0, 20);
  console.log(`\n=== Failed jobs (${failed.length}) ===`);
  for (const j of failed) {
    if (!j) { console.log('  [failed] <null entry — job hash missing>'); continue; }
    console.log(`  [failed] id=${j.id} name=${j.name} attemptsMade=${j.attemptsMade}`);
    console.log(`           data=${JSON.stringify(j.data).slice(0, 160)}`);
    console.log(`           reason=${j.failedReason}`);
    console.log(`           finishedOn=${j.finishedOn ? new Date(j.finishedOn).toISOString() : 'n/a'}`);
  }

  const active = await queue.getActive(0, 20);
  console.log(`\n=== Active jobs (${active.length}) ===`);
  for (const j of active) {
    if (!j) { console.log('  [active] <null>'); continue; }
    console.log(`  [active] id=${j.id} name=${j.name} processedOn=${j.processedOn ? new Date(j.processedOn).toISOString() : 'n/a'}`);
  }

  const waiting = await queue.getWaiting(0, 20);
  console.log(`\n=== Waiting jobs (${waiting.length}) ===`);
  for (const j of waiting) {
    if (!j) { console.log('  [waiting] <null>'); continue; }
    console.log(`  [waiting] id=${j.id} name=${j.name}`);
  }

  // Inspect raw worker registry (stalled-check heartbeats)
  const workers = await queue.getWorkers();
  console.log(`\n=== Registered workers (${workers.length}) ===`);
  for (const w of workers) {
    console.log(`  ${JSON.stringify(w)}`);
  }

  await queue.close();
  await redis.quit();
}

main().catch(console.error);
