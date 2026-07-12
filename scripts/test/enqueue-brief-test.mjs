import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redis = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null, db: Number(process.env.REDIS_DB || 0) });
const prefix = process.env.BULLMQ_PREFIX || 'bull';
const queue = new Queue('brief-generation', { connection: redis, prefix });

const job = await queue.add('generate-brief', {
  applicationId: 'app-vamsi-resume-gtm-8264-5959604e',
});
console.log('Enqueued job id=', job.id);
await queue.close();
await redis.quit();
