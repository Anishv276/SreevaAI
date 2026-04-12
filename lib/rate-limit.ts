import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export class RateLimiter {
  private keyPrefix: string;
  private limitCount: number;
  private windowSeconds: number;

  constructor(keyPrefix: string, limitCount: number, windowSeconds: number) {
    this.keyPrefix = keyPrefix;
    this.limitCount = limitCount;
    this.windowSeconds = windowSeconds;
  }

  /**
   * Checks if the identifier is within the rate limit.
   * Returns an object indicating success and remaining attempts.
   */
  async check(identifier: string): Promise<{ success: boolean; remaining: number; reset: number }> {
    const key = `ratelimit:${this.keyPrefix}:${identifier}`;
    
    // Increment the count in Redis
    const currentCount = await redis.incr(key);

    // If this is the first hit, set an expiry for the window
    if (currentCount === 1) {
      await redis.expire(key, this.windowSeconds);
    }

    const remaining = Math.max(0, this.limitCount - currentCount);
    const ttl = await redis.ttl(key);
    const reset = Date.now() + (ttl > 0 ? ttl * 1000 : this.windowSeconds * 1000);

    if (currentCount > this.limitCount) {
      return { success: false, remaining, reset };
    }

    return { success: true, remaining, reset };
  }
}

// Pre-defined limiters
export const submissionLimiter = new RateLimiter('submission', 2000, 3600); // 2,000 per hour
export const extractionLimiter = new RateLimiter('extraction', 10000, 3600); // 10,000 per hour
