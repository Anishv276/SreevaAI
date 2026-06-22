import { Queue } from 'bullmq';
import Redis from 'ioredis';

const redis = new Redis({ host: 'localhost', port: 6379 });
const resumeQueue = new Queue('resume-processing', { connection: redis, prefix: 'dev' });
const job = await resumeQueue.add('screen-resume', {
  applicationId: 'test-' + Date.now(),
  bucket: 'resumes',
  key: 'resume/lumoscale-2028/gtm_engineer__fresher_/1782152867921_0_Vamsi_resume_-_GTM.pdf',
  fileName: 'test.pdf',
  orgId: 'org123'
});
console.log('Job:', job.id);
await redis.disconnect();
