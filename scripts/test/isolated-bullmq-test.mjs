import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const redis1 = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const redis2 = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const prefix = process.env.BULLMQ_PREFIX || 'bull';

const queue = new Queue('isolated-test-queue', { connection: redis1, prefix });
const worker = new Worker('isolated-test-queue', async (job) => {
  console.log('JOB PICKED UP:', job.id, job.data);
  return { ok: true };
}, { connection: redis2, prefix });

worker.on('completed', (job) => console.log('COMPLETED:', job.id));
worker.on('failed', (job, err) => console.log('FAILED:', job?.id, err.message));
worker.on('error', (err) => console.log('WORKER ERROR:', err.message));

await worker.waitUntilReady();
console.log('Worker ready, adding job...');
const job = await queue.add('test', { hello: 'world' });
console.log('Job added:', job.id);

setTimeout(async () => {
  console.log('Timing out after 15s, closing.');
  await worker.close();
  await queue.close();
  process.exit(0);
}, 15000);
