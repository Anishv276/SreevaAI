import redisConnection, { getBullPrefix } from "./redis";
import { Queue } from 'bullmq';
/**
 * QUEUE DEFINITIONS
 * Cleanup policy (both completed AND failed jobs -- a lingering job in either
 * state can block a same-jobId re-run, so both must clear):
 *  - resume-processing, jd-upload: 5 min  (larger files / slower external calls)
 *  - everything else:              2 min
 *
 * Nothing ever accumulates -- no manual cleanup needed.
 *
 * Every queue is namespaced by `prefix` (BULLMQ_PREFIX) so dev/prod deployments
 * sharing one Redis instance never consume each other's jobs. The worker uses
 * the SAME prefix (see worker.ts), so they stay matched.
 */
const prefix = getBullPrefix();
const FIVE_MIN = 5 * 60;
const TWO_MIN = 2 * 60;
const defaultJobOptions = {
  removeOnComplete: { age: TWO_MIN },
  removeOnFail:    { age: TWO_MIN },
};
// 1. Resume PDF text extraction and AI screening
export const resumeQueue = new Queue('resume-processing', {
  connection: redisConnection,
  prefix,
  defaultJobOptions: {
    removeOnComplete: { age: FIVE_MIN },
    removeOnFail:    { age: FIVE_MIN },
  },
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
    removeOnComplete: { age: TWO_MIN },
    removeOnFail:    { age: TWO_MIN },
  },
});
// 6. AI-generated JD PDF uploads to Cloudflare R2
export const jdUploadQueue = new Queue('jd-upload', {
  connection: redisConnection,
  prefix,
  defaultJobOptions: {
    removeOnComplete: { age: FIVE_MIN },
    removeOnFail:    { age: FIVE_MIN },
  },
});
// 7. Server-side interview recording finalization (LiveKit egress completion)
export const interviewRecordingQueue = new Queue('interview-recording', {
  connection: redisConnection,
  prefix,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: TWO_MIN },
    removeOnFail:    { age: TWO_MIN },
  },
});
// 8. Recording retention cleanup after the retention window expires
export const recordingRetentionQueue = new Queue('recording-retention-cleanup', {
  connection: redisConnection,
  prefix,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: TWO_MIN },
    removeOnFail:    { age: TWO_MIN },
  },
});
// 9. Interview-start transition (PENDING → IN_PROGRESS)
export const interviewStartQueue = new Queue('interview-start', {
  connection: redisConnection,
  prefix,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: TWO_MIN },
    removeOnFail:    { age: TWO_MIN },
  },
});
// 9b. Agent-connect timeout — delayed check that fails the interview if the
// LiveKit agent never actually joins within LAUNCHING (see worker.ts).
export const interviewLaunchTimeoutQueue = new Queue('interview-launch-timeout', {
  connection: redisConnection,
  prefix,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: TWO_MIN },
    removeOnFail:    { age: TWO_MIN },
  },
});
// 10. Pre-generate interview brief at slot confirmation (real candidates only)
export const briefGenerationQueue = new Queue('brief-generation', {
  connection: redisConnection,
  prefix,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: TWO_MIN },
    removeOnFail:    { age: TWO_MIN },
  },
});
// 11. Post-interview report/summary/billing-snapshot/debug-PDF tail, moved off
// the LiveKit agent job (which LiveKit Cloud recycles shortly after the room
// closes) onto this durable worker. attempts: 1 -- billing-usage persistence
// and the Slack PDF upload are not idempotent, so no automatic retry.
const FIVE_MIN_REPORT = 5 * 60;
export const interviewReportQueue = new Queue('interview-report', {
  connection: redisConnection,
  prefix,
  defaultJobOptions: {
    attempts: 1,
    // jobId is the interview's appId, so a lingering job in EITHER state blocks
    // any future re-run for that SAME appId (BullMQ silently no-ops .add()
    // against an existing jobId); clearing it promptly keeps repeated /test
    // runs from needing manual Redis cleanup and stops one failed job from
    // blocking every subsequent attempt for that interview. Raised to 5 min
    // (from 2) since the report pipeline itself runs close to that long.
    removeOnComplete: { age: FIVE_MIN_REPORT },
    removeOnFail:    { age: FIVE_MIN_REPORT },
  },
});
export default redisConnection;
