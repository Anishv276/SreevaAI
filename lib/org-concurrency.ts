import type { Job } from "bullmq";
import { DelayedError } from "bullmq";
import redisConnection from "./redis";

/**
 * Per-org concurrency limiter, layered on top of BullMQ's global `concurrency`.
 *
 * BullMQ OSS has no per-key ("group") concurrency -- that's a BullMQ Pro-only
 * feature (`group.id` + `groupConcurrency`). This is the standard OSS
 * workaround: a Redis-counted semaphore keyed by orgId, checked right before a
 * job runs. If the org is already at its cap, the job is moved to "delayed"
 * (not failed) and retried shortly -- other orgs' jobs keep flowing through
 * the same worker/queue in the meantime.
 *
 * Slot release MUST run in `finally` (job success, failure, or thrown error) --
 * a stuck slot would starve that org's jobs forever. As a backstop against a
 * worker crashing between acquire and release (no `finally` runs), every slot
 * carries a TTL so it self-expires.
 */

const SLOT_TTL_SECONDS = 15 * 60; // matches the resume-processing job lockDuration
const RETRY_DELAY_MS = 3000;

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

function slotKey(queueName: string, orgId: string): string {
  return `org-concurrency:${queueName}:${orgId}`;
}

async function acquireOrgSlot(queueName: string, orgId: string, maxPerOrg: number): Promise<boolean> {
  const result = await redisConnection.eval(
    acquireScript,
    1,
    slotKey(queueName, orgId),
    String(maxPerOrg),
    String(SLOT_TTL_SECONDS),
  );
  return result === 1;
}

async function releaseOrgSlot(queueName: string, orgId: string): Promise<void> {
  await redisConnection.eval(releaseScript, 1, slotKey(queueName, orgId)).catch(() => {
    // best-effort -- TTL backstop covers a failed release
  });
}

/**
 * Wraps a job handler with a per-org concurrency cap. Call from inside the
 * BullMQ processor function, passing the same `job` and `token` the processor
 * receives (the token is required to move the job to "delayed" cleanly).
 *
 * Usage:
 *   new Worker(queueName, async (job, token) => {
 *     return runWithOrgSlot(queueName, job, token, orgId, maxPerOrg, async () => {
 *       ... actual job body ...
 *     });
 *   }, { concurrency: N, ... });
 */
export async function runWithOrgSlot<T>(
  queueName: string,
  job: Job,
  token: string | undefined,
  orgId: string | null | undefined,
  maxPerOrg: number,
  fn: () => Promise<T>,
): Promise<T> {
  // Jobs without an orgId (shouldn't normally happen) skip the cap entirely
  // rather than blocking on a shared "undefined" bucket.
  if (!orgId) return fn();

  const gotSlot = await acquireOrgSlot(queueName, orgId, maxPerOrg);
  if (!gotSlot) {
    await job.moveToDelayed(Date.now() + RETRY_DELAY_MS, token);
    throw new DelayedError();
  }

  try {
    return await fn();
  } finally {
    await releaseOrgSlot(queueName, orgId);
  }
}
