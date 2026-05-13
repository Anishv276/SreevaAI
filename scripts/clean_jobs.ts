import { Queue } from 'bullmq';
import * as dotenv from 'dotenv';
import { createRedisConnection } from '../lib/redis';

dotenv.config();

const connection = createRedisConnection();

async function cleanFailedJobs() {
    const queues = ['resume-processing', 'interview-finalization'];
    
    for (const name of queues) {
        console.log(`\nCleaning queue: ${name}`);
        const q = new Queue(name, { connection });
        
        const failedCount = await q.getFailedCount();
        console.log(`Found ${failedCount} failed jobs`);
        
        if (failedCount > 0) {
            // Remove all failed jobs permanently
            await q.clean(0, 1000, 'failed');
            console.log(`Cleared all failed jobs from ${name}`);
        }
    }
    
    await connection.quit();
    console.log("\nAll stale jobs cleared. Worker is now clean.");
}

cleanFailedJobs();
