import { Queue } from 'bullmq';
import * as dotenv from 'dotenv';
import { createRedisConnection } from '../lib/redis';
dotenv.config();
const connection = createRedisConnection();
async function retryFailedJobs() {
    const queues = ['resume-processing', 'interview-finalization'];
    for (const name of queues) {
        console.log(`Processing queue: ${name}`);
        const q = new Queue(name, { connection });
        const failedCount = await q.getFailedCount();
        console.log(`Found ${failedCount} failed jobs in ${name}`);
        if (failedCount > 0) {
            const failedJobs = await q.getFailed();
            for (const job of failedJobs) {
                console.log(`Retrying job ${job.id}...`);
                await job.retry();
            }
            console.log(`Retried ${failedJobs.length} jobs in ${name}`);
        }
    }
    await connection.quit();
    console.log("Retry script complete.");
}
retryFailedJobs();
