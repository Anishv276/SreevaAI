import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { enqueueResumeBatch } from '../lib/resume-queue-publisher';
import { randomUUID } from 'crypto';

/**
 * Repairs stuck ResumeCandidate rows by:
 * 1. Creating missing Application rows (if they don't exist yet)
 * 2. Linking applicationId on the candidate
 * 3. Re-queuing the batch for processing
 */
async function main() {
  const stuckCandidates = await prisma.resumeCandidate.findMany({
    where: {
      resumeStatus: { in: ['waiting', 'processing'] },
      isDeleted: false,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      fileName: true,
      resumeData: true,
      applicationId: true,
      bulkBatchId: true,
      driveId: true,
      resumeStatus: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (stuckCandidates.length === 0) {
    console.log('No stuck candidates found. All good!');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${stuckCandidates.length} stuck candidate(s).`);

  for (const c of stuckCandidates) {
    const resumeData = c.resumeData ? JSON.parse(c.resumeData) : {};
    const source = resumeData?.source || {};
    const resumeUrl = source.url || '';

    let appId = c.applicationId || source.applicationId || null;

    // Check if the application actually exists
    if (appId) {
      const existing = await prisma.application.findUnique({
        where: { id: appId },
        select: { id: true }
      });
      if (!existing) {
        console.log(`  Candidate ${c.id}: applicationId ${appId} not in DB — will create.`);
        appId = null; // force create
      }
    }

    if (!appId) {
      // Create the missing Application row
      appId = source.applicationId || `app-repair-${randomUUID().slice(0, 8)}`;
      console.log(`  Creating Application ${appId} for candidate ${c.id} (${c.fullName})`);
      await prisma.application.create({
        data: {
          id: appId,
          fullName: c.fullName,
          email: c.email || '',
          phone: c.phone || '',
          resumeUrl,
          aiScore: 0,
          aiReport: JSON.stringify({ processing: { stage: 'waiting', progress: 0 } }),
          resumeText: null,
          resumeData: null,
          driveId: c.driveId,
          resumeStatus: 'waiting',
          interviewStatus: 'pending',
          hiringStatus: 'pending',
        }
      });

      // Update resumeData on the candidate to embed the applicationId
      const newResumeData = {
        ...resumeData,
        source: { ...source, applicationId: appId },
      };
      await prisma.resumeCandidate.update({
        where: { id: c.id },
        data: {
          applicationId: appId,
          resumeData: JSON.stringify(newResumeData),
        }
      });
      console.log(`  Linked applicationId=${appId} on candidate ${c.id}`);
    }
  }

  // Now re-queue all stuck batches
  const batchMap = new Map<string, { driveId: string; orgId: string; candidateIds: string[] }>();
  for (const c of stuckCandidates) {
    if (!batchMap.has(c.bulkBatchId)) {
      const batch = await prisma.resumeBatch.findUnique({
        where: { id: c.bulkBatchId },
        select: { driveId: true, orgId: true }
      });
      if (!batch?.orgId) {
        console.warn(`  Batch ${c.bulkBatchId} missing or no orgId, skipping.`);
        continue;
      }
      batchMap.set(c.bulkBatchId, { driveId: batch.driveId, orgId: batch.orgId, candidateIds: [] });
    }
    batchMap.get(c.bulkBatchId)?.candidateIds.push(c.id);
  }

  for (const [batchId, { driveId, orgId, candidateIds }] of batchMap) {
    await prisma.resumeBatch.update({
      where: { id: batchId },
      data: { status: 'QUEUED', updatedAt: new Date() }
    });

    const jobIds = await enqueueResumeBatch(
      { batchId, driveId, orgId, candidateIds },
      { jobIdSuffix: `repair_${Date.now()}` }
    );
    console.log(`\nRe-queued batch ${batchId}: ${candidateIds.length} candidate(s) -> jobs: ${jobIds.join(', ')}`);
  }

  await prisma.$disconnect();
  console.log('\nDone. Watch the worker terminal for processing logs.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
