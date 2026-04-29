import redis from "@/lib/redis";

/**
 * Basic Redis-based Rate Limiter.
 * Counts requests within a sliding window.
 */
export async function isRateLimited(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (!redis) return false; // Fail open if Redis is down

    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);
    const redisKey = `ratelimit:${key}`;

    try {
        const multi = redis.multi();
        
        // Remove old entries
        multi.zremrangebyscore(redisKey, 0, windowStart);
        // Add new entry with random suffix to ensure unique members in the sorted set
        multi.zadd(redisKey, now, `${now}-${Math.random()}`);
        // Count entries in window
        multi.zcard(redisKey);
        // Set expiry on the whole key
        multi.expire(redisKey, windowSeconds + 1);

        const results = await multi.exec();
        if (!results) return false;

        // Results is an array of responses: [ [err, result], [err, result], ... ]
        // multi.zcard is the 3rd operation (index 2).
        const count = results[2][1] as number;
        return count > limit;
    } catch (error) {
        console.error("Rate Limiter Error:", error);
        return false; // Fail open
    }
}

export class RateLimiter {
  private keyPrefix: string;
  private limitCount: number;
  private windowSeconds: number;

  constructor(keyPrefix: string, limitCount: number, windowSeconds: number) {
    this.keyPrefix = keyPrefix;
    this.limitCount = limitCount;
    this.windowSeconds = windowSeconds;
  }

  async check(identifier: string): Promise<{ success: boolean; remaining: number; reset: number }> {
    const isLimited = await isRateLimited(`${this.keyPrefix}:${identifier}`, this.limitCount, this.windowSeconds);
    const remaining = isLimited ? 0 : 1;
    const reset = Date.now() + (this.windowSeconds * 1000);

    return { success: !isLimited, remaining, reset };
  }
}

export const submissionLimiter = new RateLimiter('submission', 2000, 3600);
export const extractionLimiter = new RateLimiter('extraction', 10000, 3600);
