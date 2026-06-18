import redis from "@/lib/redis";
/**
 * Basic Redis-based Rate Limiter.
 * Counts requests within a sliding window.
 */
/**
 * @param failClosed when true, treat a Redis outage/error as "limited" (block).
 *   Use this for auth-sensitive limiters (login, OTP) so an attacker can't bypass
 *   throttling by knocking Redis over. Non-auth flows keep failing open so a
 *   transient Redis blip doesn't break normal usage.
 */
export async function isRateLimited(
    key: string,
    limit: number,
    windowSeconds: number,
    failClosed = false,
): Promise<boolean> {
    if (!redis) return failClosed; // fail open (false) or closed (true) per caller
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
        if (!results) return failClosed;
        // Results is an array of responses: [ [err, result], [err, result], ... ]
        // multi.zcard is the 3rd operation (index 2).
        const count = results[2][1] as number;
        return count > limit;
    } catch (error) {
        console.error("Rate Limiter Error:", error);
        return failClosed;
    }
}
export class RateLimiter {
  private keyPrefix: string;
  private limitCount: number;
  private windowSeconds: number;
  private failClosed: boolean;
  constructor(keyPrefix: string, limitCount: number, windowSeconds: number, failClosed = false) {
    this.keyPrefix = keyPrefix;
    this.limitCount = limitCount;
    this.windowSeconds = windowSeconds;
    this.failClosed = failClosed;
  }
  async check(identifier: string): Promise<{ success: boolean; remaining: number; reset: number }> {
    const isLimited = await isRateLimited(`${this.keyPrefix}:${identifier}`, this.limitCount, this.windowSeconds, this.failClosed);
    const remaining = isLimited ? 0 : 1;
    const reset = Date.now() + (this.windowSeconds * 1000);
    return { success: !isLimited, remaining, reset };
  }
}
// Realistic per-identifier hourly caps. The previous 2000/10000 values were so
// high they provided effectively no protection.
export const submissionLimiter = new RateLimiter('submission', 100, 3600);
export const extractionLimiter = new RateLimiter('extraction', 200, 3600, true);
