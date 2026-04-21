import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL && process.env.NODE_ENV === 'production') {
  console.error("CRITICAL: REDIS_URL is not defined. Background processing (BullMQ) will be disabled.");
}

/**
 * Shared IORedis connection for BullMQ.
 * - lazyConnect: true  -> don't connect until first command, so Next.js won't
 *                         hard-crash at startup if Redis isn't ready yet.
 * - retryStrategy     -> keeps retrying with back-off instead of throwing.
 * - maxRetriesPerRequest: null -> required by BullMQ.
 */
function createRedisConnection(): IORedis {
  return new IORedis(REDIS_URL || 'redis://localhost:6379', {
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
  removeOnComplete: true, // Remove completed jobs immediately to keep Redis lean
  removeOnFail: { count: 100 },    // Keep the last 100 failed jobs for debugging
};

// 1. Handles resume PDF text extraction and screening
export const resumeQueue = new Queue('resume-processing', {
  connection: redisConnection,
  defaultJobOptions
});

// 2. Handles transactional emails (invites, reports)
export const emailQueue = new Queue('email-delivery', {
  connection: redisConnection,
  defaultJobOptions
});

// 3. Handles async interview recording/transcript persistence
export const interviewFinalizationQueue = new Queue('interview-finalization', {
  connection: redisConnection,
  defaultJobOptions
});

// 4. Handles proctoring snapshots (direct R2 upload + DB sync)
export const interviewSnapshotQueue = new Queue('interview-snapshots', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true, // DELETE IMMEDIATELY to save 32MB RAM
    removeOnFail: { count: 1 }, // Keep only 1 for debugging
  }
});

// 5. Handles AI-generated JD PDF uploads to Cloudflare R2
export const jdUploadQueue = new Queue('jd-upload', {
  connection: redisConnection,
  defaultJobOptions
});

export default redisConnection;
