import redisConnection from "./redis";

/**
 * Per-org concurrency limiter for Modal-backed jobs (resume extraction,
 * interview report generation). Modal has no native per-key concurrency
 * primitive (confirmed against their docs -- max_containers/@modal.concurrent are
 * global per function only), so this reuses the exact same Redis INCR/EXPIRE
 * semaphore pattern already proven in lib/org-concurrency.ts, just gating entry into
 * a Modal fetch() call instead of a BullMQ job handler running inline.
 *
 * Slot release MUST run in `finally` -- a stuck slot would starve that org's jobs
 * forever. Every slot carries a TTL so it self-expires if a worker crashes between
 * acquire and release.
 */

const SLOT_TTL_SECONDS = 10 * 60; // Modal calls run well under this (longest today: ~300s report job)

const acquireScript = `
local key = KEYS[1]
local max = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local current = tonumber(redis.call("GET", key) or "0")
if current >= max then
  return 0
end
redis.call("INCR", key)
redis.call("EXPIRE", key, ttl)
return 1
`;

const releaseScript = `
local key = KEYS[1]
local current = tonumber(redis.call("GET", key) or "0")
if current <= 1 then
  redis.call("DEL", key)
else
  redis.call("DECR", key)
end
return 1
`;

function slotKey(jobType: string, orgId: string): string {
  return `modal-concurrency:${jobType}:${orgId}`;
}

export async function acquireModalSlot(jobType: string, orgId: string, maxPerOrg: number): Promise<boolean> {
  const result = await redisConnection.eval(
    acquireScript,
    1,
    slotKey(jobType, orgId),
    String(maxPerOrg),
    String(SLOT_TTL_SECONDS),
  );
  return result === 1;
}

export async function releaseModalSlot(jobType: string, orgId: string): Promise<void> {
  await redisConnection.eval(releaseScript, 1, slotKey(jobType, orgId)).catch(() => {
    // best-effort -- TTL backstop covers a failed release
  });
}

/**
 * Per-job-type org concurrency caps. Same shape as worker.ts's ORG_CONCURRENCY,
 * just for the 4 jobs that now run on Modal instead of BullMQ workers.
 */
export const MODAL_ORG_CONCURRENCY = {
  resumeExtraction: Number(process.env.ORG_CONCURRENCY_MODAL_RESUME || 5),
  interviewReport: Number(process.env.ORG_CONCURRENCY_MODAL_REPORT || 5),
};

/**
 * Wraps a Modal call with a per-org concurrency cap. If the org is at its cap,
 * returns { queued: true } instead of running fn -- the caller (a BullMQ job body,
 * see lib/modal-dispatch.ts) is expected to re-delay itself and retry, exactly
 * mirroring lib/org-concurrency.ts's runWithOrgSlot + job.moveToDelayed pattern.
 */
export async function withModalOrgSlot<T>(
  jobType: string,
  orgId: string | null | undefined,
  maxPerOrg: number,
  fn: () => Promise<T>,
): Promise<{ queued: false; result: T } | { queued: true }> {
  if (!orgId) {
    return { queued: false, result: await fn() };
  }

  const gotSlot = await acquireModalSlot(jobType, orgId, maxPerOrg);
  if (!gotSlot) {
    return { queued: true };
  }

  try {
    return { queued: false, result: await fn() };
  } finally {
    await releaseModalSlot(jobType, orgId);
  }
}
