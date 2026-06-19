import IORedis from "ioredis";
import { Queue } from "bullmq";
import { getRedisUrl } from "./redis";
/**
 * DEDICATED RESUME-BATCH PUBLISHER
 *
 * Why this exists: enqueuing from a Next.js API route against an external Redis
 * was unreliable. Per-request `new Queue()` + `close()` raced its own teardown
 * and silently dropped jobs (the job-id counter advanced but the wait-list LPUSH
 * never flushed). The shared singleton could also land in a half-initialized
 * state after a Turbopack hot-reload.
 *
 * This module owns ONE long-lived, keep-alived connection + Queue, cached on
 * `global` so dev hot-reloads reuse it instead of leaking connections. Every
 * enqueue is VERIFIED: after add(), we read the job back. If it isn't in Redis,
 * we throw so the caller returns 5xx instead of lying to the client.
 */
type PublisherState = {
  connection: IORedis;
  queue: Queue;
};
const GLOBAL_KEY = "__resumeQueuePublisher__";
function buildPublisher(): PublisherState {
  const connection = new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,     // connect at construction — no cold-start drop
    keepAlive: 10_000,      // TCP keepalive so external Redis never reaps us
    connectTimeout: 15_000,
    retryStrategy: (times: number) => Math.min(times * 500, 10_000),
  });
  connection.on("error", (err) => {
    console.error("[RESUME-PUBLISHER] Redis connection error:", err?.message);
  });
  const queue = new Queue("resume-processing", { connection });
  return { connection, queue };
}
function getPublisher(): PublisherState {
  const g = global as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = buildPublisher();
  }
  return g[GLOBAL_KEY] as PublisherState;
}
export interface ResumeBatchJobData {
  batchId: string;
  driveId: string;
  orgId: string;
  candidateIds: string[];
}
// A single sub-job processes at most this many candidates. Large uploads are
// fanned out into multiple sub-jobs so the BullMQ scheduler interleaves them
// with other orgs' jobs — a 1000-resume upload can't monopolize a worker slot. (#12)
const SUBJOB_SIZE = Math.max(5, Number(process.env.RESUME_SUBJOB_SIZE) || 25);
const BULLMQ_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { age: 3_600, count: 1_000 }, // keep 1h / last 1000 for observability
  removeOnFail: { age: 86_400 },                  // keep failed jobs 24h for inspection
};
/**
 * Enqueue a resume batch and VERIFY every job actually landed in Redis.
 * Large batches are fanned out into sub-jobs of SUBJOB_SIZE candidates each.
 * Throws if any job cannot be confirmed — caller must surface a 5xx.
 *
 * `jobIdSuffix` lets the recovery sweeper re-enqueue without being deduped by a
 * lingering completed job of the same id.
 */
export async function enqueueResumeBatch(
  data: ResumeBatchJobData,
  opts?: { jobIdSuffix?: string }
): Promise<string[]> {
  const { queue } = getPublisher();
  await queue.waitUntilReady(); // ensure the connection is live before we depend on it
  const ids = data.candidateIds;
  const suffix = opts?.jobIdSuffix ? `_${opts.jobIdSuffix}` : "";
  // Split candidate IDs into sub-job slices.
  const slices: string[][] = [];
  for (let i = 0; i < ids.length; i += SUBJOB_SIZE) {
    slices.push(ids.slice(i, i + SUBJOB_SIZE));
  }
  if (slices.length === 0) slices.push([]); // defensive: never enqueue nothing silently
  const jobIds: string[] = [];
  for (let part = 0; part < slices.length; part += 1) {
    const jobId = `batch_${data.batchId}${suffix}_part${part}`;
    const job = await queue.add(
      "drive-resume-batch",
      {
        batchId: data.batchId,
        driveId: data.driveId,
        orgId: data.orgId,
        candidateIds: slices[part],
      },
      { ...BULLMQ_JOB_OPTS, jobId }
    );
    const confirmed = await queue.getJob(job.id as string);
    if (!confirmed) {
      throw new Error(
        `[RESUME-PUBLISHER] Enqueue not durable — job ${job.id} for batch ${data.batchId} not found after add()`
      );
    }
    jobIds.push(job.id as string);
  }
  return jobIds;
}
