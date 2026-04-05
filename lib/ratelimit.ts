import redis from './queue';

/**
 * Basic Redis-based Rate Limiter.
 * Counts requests within a sliding window.
 */
export async function isRateLimited(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (!redis) return false; // Fail open if Redis is down (optional)

    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);
    const redisKey = `ratelimit:${key}`;

    try {
        const multi = redis.multi();
        
        // Remove old entries
        multi.zremrangebyscore(redisKey, 0, windowStart);
        // Add new entry
        multi.zadd(redisKey, now, now.toString());
        // Count entries in window
        multi.zcard(redisKey);
        // Set expiry on the whole key
        multi.expire(redisKey, windowSeconds + 1);

        const results = await multi.exec();
        if (!results) return false;

        const count = results[2][1] as number;
        return count > limit;
    } catch (error) {
        console.error("Rate Limiter Error:", error);
        return false; // Fail open
    }
}
