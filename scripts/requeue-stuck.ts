import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { enqueueResumeBatch } from '../lib/resume-queue-publisher';

/**
 * Re-queues all ResumeBatch jobs where candidates are stuck in "waiting" or "processing"
 * (i.e., the batch job ran but failed silently, leaving candidates in non-terminal states).
 */
async function main() {
  const stuckCandidates = await prisma.resumeCandidate.findMany({
    where: {
      resumeStatus: { in: ['waiting', 'processing'] },
      isDeleted: false,
    },
    select: {
      id: true,
      bulkBatchId: true,
      driveId: true,
      fullName: true,
      resumeStatus: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (stuckCandidates.length === 0) {
    console.log('No stuck candidates found.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${stuckCandidates.length} stuck candidate(s):`);
  for (const c of stuckCandidates) {
    console.log(`  ${c.id} (${c.fullName}) status=${c.resumeStatus} batch=${c.bulkBatchId}`);
  }

  // Group by batch
  const batchMap = new Map<string, { driveId: string; orgId: string | null; candidateIds: string[] }>();
  for (const c of stuckCandidates) {
    if (!batchMap.has(c.bulkBatchId)) {
      const batch = await prisma.resumeBatch.findUnique({
        where: { id: c.bulkBatchId },
        select: { driveId: true, orgId: true, status: true }
      });
      if (!batch) {
        console.warn(`  Batch ${c.bulkBatchId} not found, skipping candidate ${c.id}`);
        continue;
      }
      batchMap.set(c.bulkBatchId, { driveId: batch.driveId, orgId: batch.orgId, candidateIds: [] });
    }
    batchMap.get(c.bulkBatchId)!.candidateIds.push(c.id);
  }

  for (const [batchId, { driveId, orgId, candidateIds }] of batchMap) {
    if (!orgId) {
      console.warn(`Batch ${batchId} has no orgId, skipping.`);
      continue;
    }

    // Reset batch to QUEUED so the worker will re-process it
    await prisma.resumeBatch.update({
      where: { id: batchId },
      data: { status: 'QUEUED', updatedAt: new Date() }
    });

    const jobIds = await enqueueResumeBatch(
      { batchId, driveId, orgId, candidateIds },
      { jobIdSuffix: `requeue_${Date.now()}` }
    );
    console.log(`\nRe-queued batch ${batchId} with ${candidateIds.length} candidate(s): jobIds=${jobIds.join(', ')}`);
  }

  await prisma.$disconnect();
  console.log('\nDone. Check worker logs for processing output.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
