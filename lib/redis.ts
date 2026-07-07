import IORedis from "ioredis";
export const DEFAULT_LOCAL_REDIS_URL = "redis://localhost:6379";
export const DEFAULT_DOCKER_REDIS_URL = "redis://redis:6379";
export function getRedisUrl() {
  const configuredRedisUrl = process.env.REDIS_URL?.trim();
  if (configuredRedisUrl) {
    return configuredRedisUrl;
  }
  return process.env.NODE_ENV === "production"
    ? DEFAULT_DOCKER_REDIS_URL
    : DEFAULT_LOCAL_REDIS_URL;
}
const DEFAULT_REDIS_URL =
  process.env.NODE_ENV === "production"
    ? DEFAULT_DOCKER_REDIS_URL
    : DEFAULT_LOCAL_REDIS_URL;
// --- Silence BullMQ's built-in eviction-policy warning ---
// BullMQ internally logs "IMPORTANT! Eviction policy is volatile-lru" on every
// queue/worker connection check. We handle this ourselves or accept it, so we suppress it.
const _origLog = console.log.bind(console);
console.log = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('IMPORTANT! Eviction policy')) return;
  _origLog(...args);
};
const _origWarn = console.warn.bind(console);
console.warn = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('IMPORTANT! Eviction policy')) return;
  _origWarn(...args);
};
// ---------------------------------------------------------
// Logical Redis DB index per environment. Dev and prod MUST NOT share a DB,
// otherwise a stale worker in one environment will steal jobs enqueued by the
// other (both block on the same `bzpopmin`). Default 0; override with REDIS_DB.
export function getRedisDb(): number {
  const raw = process.env.REDIS_DB?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

// BullMQ key prefix per environment. Combined with REDIS_DB this guarantees two
// deployments never consume the same queue. Default "bull".
export function getBullPrefix(): string {
  return process.env.BULLMQ_PREFIX?.trim() || "bull";
}

const isBuildPhase = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";

function createRedisConnection(): IORedis {
  // Always creates a FRESH connection -- never returns the shared singleton.
  return new IORedis(getRedisUrl() || DEFAULT_REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: false,
    keepAlive: 10000,
    db: getRedisDb(),
    retryStrategy: (times: number) => Math.min(times * 500, 10_000),
    enableReadyCheck: false,
  });
}
export { createRedisConnection };
let redisConnection: IORedis;
if (isBuildPhase) {
  // During `next build`, no Redis is available. Return a lazy stub so that
  // module-level imports succeed without triggering DNS lookups.
  redisConnection = new IORedis(getRedisUrl() || DEFAULT_REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableReadyCheck: false,
    retryStrategy: () => null,
  });
} else if (process.env.NODE_ENV === "production") {
  redisConnection = createRedisConnection();
} else {
  if (!(global as any)._redisConnection) {
    (global as any)._redisConnection = createRedisConnection();
  }
  redisConnection = (global as any)._redisConnection;
}
export default redisConnection;
