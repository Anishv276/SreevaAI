import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const resumeQueue = new Queue('resume-processing', { 
  connection: redisConnection 
});

const prisma = new PrismaClient();

async function main() {
  console.log('--- Bulk Repopulation Started ---');
  
  const applications = await prisma.application.findMany({
    include: { drive: true }
  });

  console.log(`Found ${applications.length} candidates to process.`);

  let count = 0;
  for (const app of applications) {
    if (!app.drive?.description) {
      console.warn(`[SKIP] No JD description for ${app.email}`);
      continue;
    }

    await resumeQueue.add('process-new-candidate', {
        applicationId: app.id,
        resumeText: app.resumeText,
        resumeUrl: app.resumeUrl,
        structuredResume: app.structuredResume ? JSON.parse(app.structuredResume as string) : null,
        jdText: app.drive.description,
        drive: app.drive,
        applicantEmail: app.email,
        applicantName: app.fullName,
        force: true
    }, {
        jobId: `bulk-repopulate-${app.id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: { count: 10 }
    });

    count++;
    if (count % 10 === 0) console.log(`Queued ${count}/${applications.length}...`);
  }

  console.log(`--- Bulk Repopulation Complete: ${count} jobs added to queue ---`);
  console.log('The worker process will now analyze these candidates in the background.');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await redisConnection.quit();
  });
