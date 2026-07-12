import "dotenv/config";
import { Queue } from "bullmq";
import redisConnection, { getBullPrefix } from "../../lib/redis";

const QUEUE_NAMES = [
  "resume-processing",
  "jd-extraction",
  "brief-generation",
  "interview-report",
  "invitation-delivery-queue",
  "recording-retention-cleanup",
  "interview-start",
  "interview-launch-timeout",
  "interview-finalization",
  "interview-recording",
  "interview-snapshots",
  "jd-upload",
];

async function main() {
  const prefix = getBullPrefix();
  console.log(`Checking queues under BullMQ prefix "${prefix}"...\n`);

  let totalWaiting = 0, totalActive = 0, totalDelayed = 0, totalFailed = 0;

  for (const name of QUEUE_NAMES) {
    const q = new Queue(name, { connection: redisConnection, prefix });
    const counts = await q.getJobCounts("waiting", "active", "delayed", "failed", "completed");
    totalWaiting += counts.waiting || 0;
    totalActive += counts.active || 0;
    totalDelayed += counts.delayed || 0;
    totalFailed += counts.failed || 0;
    const hasAny = (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0) + (counts.failed || 0) > 0;
    console.log(`${hasAny ? ">>" : "  "} ${name.padEnd(30)} waiting=${counts.waiting} active=${counts.active} delayed=${counts.delayed} failed=${counts.failed} completed=${counts.completed}`);
    await q.close();
  }

  console.log(`\nTOTALS: waiting=${totalWaiting} active=${totalActive} delayed=${totalDelayed} failed=${totalFailed}`);

  const modalKeys = await redisConnection.keys("modal-concurrency:*");
  console.log(`\nModal concurrency slots currently held (org-level, live right now):`);
  if (modalKeys.length === 0) {
    console.log("  none -- no Modal job is currently mid-flight for any org.");
  } else {
    for (const key of modalKeys) {
      const val = await redisConnection.get(key);
      console.log(`  ${key} = ${val}`);
    }
  }

  await redisConnection.quit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
