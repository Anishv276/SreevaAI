import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://default:OMboFa8vP57TeD1aXCTQsi2ZkMfp2Ooa@redis-13015.crce179.ap-south-1-1.ec2.cloud.redislabs.com:13015';

/**
 * Shared IORedis connection for BullMQ.
 * - lazyConnect: true  → don't connect until first command, so Next.js won't
 *                         hard-crash at startup if Redis isn't ready yet.
 * - retryStrategy     → keeps retrying with back-off instead of throwing.
 * - maxRetriesPerRequest: null → required by BullMQ.
 */
function createRedisConnection(): IORedis {
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy: (times: number) => Math.min(times * 500, 10_000), // max 10s between retries
    enableReadyCheck: false,
  });
}

// Singleton connection to prevent leaking connections in Next.js HMR/Dev mode
let redisConnection: IORedis;

if (process.env.NODE_ENV === 'production') {
  redisConnection = createRedisConnection();
} else {
  // Avoid creating multiple connections during hot-reloads in development
  if (!(global as any)._redisConnection) {
    (global as any)._redisConnection = createRedisConnection();
  }
  redisConnection = (global as any)._redisConnection;
}

/**
 * QUEUE DEFINITIONS
 * These represent the names of the pipelines in your platform.
 */

const defaultJobOptions = {
  removeOnComplete: { count: 20 }, // Keep only the last 20 successful jobs
  removeOnFail: { count: 100 },    // Keep the last 100 failed jobs for debugging
};

// 1. Handles resume PDF text extraction and screening
export const resumeQueue = new Queue('resume-processing', { 
  connection: redisConnection,
  defaultJobOptions 
});

// 2. Handles assessment question generation (GPT-4o)
export const assessmentQueue = new Queue('assessment-generation', { 
  connection: redisConnection,
  defaultJobOptions 
});

// 3. Handles transactional emails (invites, reports)
export const emailQueue = new Queue('email-delivery', { 
  connection: redisConnection,
  defaultJobOptions 
});

// 4. Handles grading of submitted assessments (GPT-4o-mini)
export const gradingQueue = new Queue('assessment-grading', { 
  connection: redisConnection,
  defaultJobOptions 
});

// 5. Handles high-frequency proctoring violations in batches
export const proctoringQueue = new Queue('proctoring-events', { 
  connection: redisConnection,
  defaultJobOptions 
});

// 6. Handles async interview recording/transcript persistence
export const interviewFinalizationQueue = new Queue('interview-finalization', { 
  connection: redisConnection,
  defaultJobOptions 
});

export default redisConnection;
