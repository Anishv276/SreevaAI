import IORedis from "ioredis";
import { Queue } from "bullmq";
import { getRedisUrl } from "./redis";

/**
 * DEDICATED RESUME-BATCH PUBLISHER
 *
 * Each org gets its own queue: resume-processing:{orgId}
 * This means Org A's 1000-resume upload never blocks Org B's 5-resume upload.
 * The worker side dynamically subscribes to each org queue the first time it sees one.
 *
 * One long-lived Redis connection + per-org Queue cache, stored on `global` so
 * Next.js hot-reloads reuse them instead of leaking connections.
 * Every enqueue is VERIFIED: after add(), we read the job back.
 */

type PublisherState = {
  connection: IORedis;
  queues: Map<string, Queue>;
};

const GLOBAL_KEY = "__resumeQueuePublisher__";

function buildPublisher(): PublisherState {
  const connection = new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    keepAlive: 10_000,
    connectTimeout: 15_000,
    retryStrategy: (times: number) => Math.min(times * 500, 10_000),
  });
  connection.on("error", (err) => {
    console.error("[RESUME-PUBLISHER] Redis connection error:", err?.message);
  });
  return { connection, queues: new Map() };
}

function getPublisher(): PublisherState {
  const g = global as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = buildPublisher();
  }
  return g[GLOBAL_KEY] as PublisherState;
}

export function orgQueueName(orgId: string): string {
  return `resume-processing--${orgId}`;
}

function getOrgQueue(orgId: string): Queue {
  const { connection, queues } = getPublisher();
  const name = orgQueueName(orgId);
  if (!queues.has(name)) {
    queues.set(name, new Queue(name, { connection }));
  }
  return queues.get(name)!;
}

export interface ResumeBatchJobData {
  batchId: string;
  driveId: string;
  orgId: string;
  candidateIds: string[];
}

// Each sub-job processes exactly SUBJOB_SIZE candidates, all in parallel.
// Keeping this at 5 means each sub-job is fast and orgs get fair turn-taking.
const SUBJOB_SIZE = Math.max(1, Number(process.env.RESUME_SUBJOB_SIZE) || 5);

const BULLMQ_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { count: 0 },
  removeOnFail: { count: 0 },
};

/**
 * Enqueue to the org's dedicated queue and verify every job landed in Redis.
 * Large batches are fanned out into sub-jobs of SUBJOB_SIZE candidates each.
 */
const ORG_REGISTRY_KEY = "resume-worker:active-orgs";

export async function enqueueResumeBatch(
  data: ResumeBatchJobData,
  opts?: { jobIdSuffix?: string }
): Promise<string[]> {
  const queue = getOrgQueue(data.orgId);
  await queue.waitUntilReady();
  // Register this org so the worker process knows to spin up a dedicated worker for it.
  await getPublisher().connection.sadd(ORG_REGISTRY_KEY, data.orgId).catch(() => {});

  const ids = data.candidateIds;
  const suffix = opts?.jobIdSuffix ? `_${opts.jobIdSuffix}` : "";

  const slices: string[][] = [];
  for (let i = 0; i < ids.length; i += SUBJOB_SIZE) {
    slices.push(ids.slice(i, i + SUBJOB_SIZE));
  }
  if (slices.length === 0) slices.push([]);

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
