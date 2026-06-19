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
function createRedisConnection(): IORedis {
  return new IORedis(getRedisUrl() || DEFAULT_REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: false,
    keepAlive: 10000,
    retryStrategy: (times: number) => Math.min(times * 500, 10_000),
    enableReadyCheck: false,
  });
}
export { createRedisConnection };
let redisConnection: IORedis;
if (process.env.NODE_ENV === "production") {
  redisConnection = createRedisConnection();
} else {
  if (!(global as any)._redisConnection) {
    (global as any)._redisConnection = createRedisConnection();
  }
  redisConnection = (global as any)._redisConnection;
}
export default redisConnection;
