
import { Redis } from 'ioredis'

async function debugRedis() {
    console.log('--- Redis Debug Start ---')
    const redisUrl = process.env.REDIS_URL;
    console.log('REDIS_URL found:', !!redisUrl)
    
    if (!redisUrl) {
        console.error('REDIS_URL is missing in .env')
        return
    }

    const redis = new Redis(redisUrl)

    try {
        console.log('Attempting to ping Redis...')
        const response = await redis.ping()
        console.log('Redis Ping Response:', response)
        
        const keys = await redis.keys('bull:*')
        console.log('Found BullMQ keys:', keys.length)
        
    } catch (err: any) {
        console.error('Redis connection failed!')
        console.error('Error message:', err.message)
    } finally {
        await redis.quit()
        console.log('--- Redis Debug End ---')
    }
}

debugRedis()
