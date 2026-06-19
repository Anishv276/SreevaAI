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

  const [waiting, active, delayed, failed, completed] = await Promise.all([
    queue.getWaiting(),
    queue.getActive(),
    queue.getDelayed(),
    queue.getFailed(0, 10),
    queue.getCompleted(0, 5),
  ]);

  console.log(`\n=== resume-processing queue state ===`);
  console.log(`Waiting: ${waiting.length}`);
  for (const j of waiting) {
    console.log(`  [waiting] id=${j.id} name=${j.name} data=${JSON.stringify(j.data).slice(0, 120)}`);
  }
  console.log(`Active: ${active.length}`);
  for (const j of active) {
    console.log(`  [active] id=${j.id} name=${j.name}`);
  }
  console.log(`Delayed: ${delayed.length}`);
  console.log(`Failed: ${failed.length}`);
  for (const j of failed) {
    console.log(`  [failed] id=${j.id} name=${j.name} reason=${j.failedReason}`);
  }
  console.log(`Completed (last 5): ${completed.length}`);
  for (const j of completed) {
    console.log(`  [completed] id=${j.id} name=${j.name}`);
  }

  await queue.close();
  await redis.quit();
}

main().catch(console.error);
