import IORedis from "ioredis";
import { Queue } from "bullmq";
import { getRedisUrl } from "./redis";

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

export interface ResumeJobData {
  driveId: string;
  orgId: string;
  candidateIds: string[];
}

const BULLMQ_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { count: 0 },
  removeOnFail: { count: 0 },
};

const ORG_REGISTRY_KEY = "resume-worker:active-orgs";

/**
 * Enqueue all candidates as a single job on the org's dedicated queue.
 * Up to 500 resumes per upload — all processed in parallel by the worker.
 */
export async function enqueueResumeJob(data: ResumeJobData): Promise<string> {
  const queue = getOrgQueue(data.orgId);
  await queue.waitUntilReady();
  await getPublisher().connection.sadd(ORG_REGISTRY_KEY, data.orgId).catch(() => {});

  const jobId = `resume_${data.orgId}_${Date.now()}`;
  const job = await queue.add(
    "drive-resume-batch",
    {
      driveId: data.driveId,
      orgId: data.orgId,
      candidateIds: data.candidateIds,
    },
    { ...BULLMQ_JOB_OPTS, jobId }
  );
  const confirmed = await queue.getJob(job.id as string);
  if (!confirmed) {
    throw new Error(
      `[RESUME-PUBLISHER] Enqueue not durable — job ${job.id} not found after add()`
    );
  }
  return job.id as string;
}
