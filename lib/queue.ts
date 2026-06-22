import redisConnection, { getBullPrefix } from "./redis";
import { Queue } from 'bullmq';
/**
 * QUEUE DEFINITIONS
 * All queues share this cleanup policy:
 *  - Completed jobs: auto-deleted 60s after finishing   (keeps Redis lean)
 *  - Failed jobs:    auto-deleted 60s after failure     (never block new jobs)
 *
 * Nothing ever accumulates — no manual cleanup needed.
 *
 * Every queue is namespaced by `prefix` (BULLMQ_PREFIX) so dev/prod deployments
 * sharing one Redis instance never consume each other's jobs. The worker uses
 * the SAME prefix (see worker.ts), so they stay matched.
 */
const prefix = getBullPrefix();
const defaultJobOptions = {
  removeOnComplete: { age: 60 },   // completed jobs gone after 60s
  removeOnFail:    { age: 60 },    // failed jobs gone after 60s — frees slot for next job
};
// 1. Resume PDF text extraction and AI screening
export const resumeQueue = new Queue('resume-processing', {
  connection: redisConnection,
  prefix,
  defaultJobOptions,
});

// 3. Interview invitation delivery (delayed sends)
export const invitationDeliveryQueue = new Queue('invitation-delivery-queue', {
  connection: redisConnection,
  prefix,
  defaultJobOptions,
});
// 4. Async interview recording / transcript persistence
export const interviewFinalizationQueue = new Queue('interview-finalization', {
  connection: redisConnection,
  prefix,
  defaultJobOptions,
});
// 5. Proctoring snapshots (direct R2 upload + DB sync)
export const interviewSnapshotQueue = new Queue('interview-snapshots', {
  connection: redisConnection,
  prefix,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 60 },
    removeOnFail:    { age: 60 },
  },
});
// 6. AI-generated JD PDF uploads to Cloudflare R2
export const jdUploadQueue = new Queue('jd-upload', {
  connection: redisConnection,
  prefix,
  defaultJobOptions,
});
// 7. Server-side interview recording finalization (LiveKit egress completion)
export const interviewRecordingQueue = new Queue('interview-recording', {
  connection: redisConnection,
  prefix,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 60 },
    removeOnFail:    { age: 60 },
  },
});
// 8. Recording retention cleanup after the retention window expires
export const recordingRetentionQueue = new Queue('recording-retention-cleanup', {
  connection: redisConnection,
  prefix,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 60 },
    removeOnFail:    { age: 60 },
  },
});
// 9. Interview-start transition (PENDING → IN_PROGRESS)
export const interviewStartQueue = new Queue('interview-start', {
  connection: redisConnection,
  prefix,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 60 },
    removeOnFail:    { age: 60 },
  },
});
export default redisConnection;
