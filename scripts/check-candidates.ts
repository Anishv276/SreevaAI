import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
  // Find the most recently updated candidate
  const candidates = await prisma.resumeCandidate.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      fullName: true,
      resumeStatus: true,
      aiScore: true,
      aiReport: true,
      applicationId: true,
      bulkBatchId: true,
      updatedAt: true,
    }
  });

  console.log('\n=== Recent ResumeCandidate rows ===');
  for (const c of candidates) {
    console.log(`id=${c.id}`);
    console.log(`  name=${c.fullName}, status=${c.resumeStatus}, score=${c.aiScore}`);
    console.log(`  applicationId=${c.applicationId}`);
    console.log(`  batchId=${c.bulkBatchId}`);
    const report = c.aiReport ? JSON.parse(c.aiReport) : null;
    console.log(`  report.stage=${report?.processing?.stage}, report.progress=${report?.processing?.progress}`);
    console.log(`  updatedAt=${c.updatedAt.toISOString()}`);
    console.log('');

    if (c.applicationId) {
      const app = await prisma.application.findUnique({
        where: { id: c.applicationId },
        select: { id: true, resumeStatus: true, aiScore: true, fullName: true }
      });
      console.log(`  linked Application: ${JSON.stringify(app)}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
