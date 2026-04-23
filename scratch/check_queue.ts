import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
  console.log("Connecting to Redis:", process.env.REDIS_URL);
  
  const redisConnection = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
  });

  const queue = new Queue('resume-processing', { connection: redisConnection });
  
  const waitingCount = await queue.getWaitingCount();
  const activeCount = await queue.getActiveCount();
  const failedCount = await queue.getFailedCount();
  const delayedCount = await queue.getDelayedCount();
  
  console.log(`Waiting: ${waitingCount}`);
  console.log(`Active: ${activeCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Delayed: ${delayedCount}`);
  
  if (failedCount > 0) {
      const failedJobs = await queue.getFailed();
      for (const job of failedJobs) {
          console.log(`Failed Job ID: ${job.id}, Error: ${job.failedReason}`);
      }
  }

  process.exit(0);
}

check().catch(console.error);
