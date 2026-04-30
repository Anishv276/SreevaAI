import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL?.trim();
const DEFAULT_REDIS_URL =
  process.env.NODE_ENV === "production"
    ? "redis://redis:6379"
    : "redis://localhost:6379";

function createRedisConnection(): IORedis {
  return new IORedis(REDIS_URL || DEFAULT_REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy: (times: number) => Math.min(times * 500, 10_000),
    enableReadyCheck: false,
  });
}

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
