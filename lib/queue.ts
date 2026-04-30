import { Queue } from 'bullmq';
import redisConnection from "./redis";

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

// 2b. Handles delayed interview invitation delivery
export const invitationDeliveryQueue = new Queue('invitation-delivery-queue', {
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
