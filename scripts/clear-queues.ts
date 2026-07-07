import 'dotenv/config';
import { Queue } from 'bullmq';
import redisConnection from '../lib/redis';
async function clearQueues() {
    const queueNames = [
        'invitation-delivery-queue',
        'email-delivery',
        'resume-processing',
        'interview-report',
    ];
    for (const name of queueNames) {
        const q = new Queue(name, { connection: redisConnection });
        const [waiting, delayed, failed, completed, active] = await Promise.all([
            q.getWaiting(),
            q.getDelayed(),
            q.getFailed(),
            q.getCompleted(),
            q.getActive(),
        ]);
        const all = [...waiting, ...delayed, ...failed, ...completed, ...active];
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
