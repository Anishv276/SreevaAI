import 'dotenv/config';
import { Queue } from 'bullmq';
import redisConnection from './lib/redis';

async function clearQueues() {
    const queueNames = [
        'invitation-delivery-queue',
        'email-delivery',
        'resume-processing',
    ];

    for (const name of queueNames) {
        const q = new Queue(name, { connection: redisConnection });
        const [waiting, delayed, failed] = await Promise.all([
            q.getWaiting(),
            q.getDelayed(),
            q.getFailed(),
        ]);
        const all = [...waiting, ...delayed, ...failed];
        console.log(`[${name}] Removing ${all.length} stale jobs...`);
        for (const job of all) {
            await job.remove();
        }
        await q.close();
    }

    console.log('✅ All stale jobs cleared. Safe to restart the worker.');
    process.exit(0);
}

clearQueues().catch(e => {
    console.error('Error clearing queues:', e);
    process.exit(1);
});
