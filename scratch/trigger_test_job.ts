
import { prisma } from "../lib/prisma";
import { interviewFinalizationQueue } from "../lib/queue";

async function main() {
  const applicationId = "app-vamsi-2026-1-cmp8occmg00-3900";

  console.log(`[TEST] Clearing report for ${applicationId}...`);
  await prisma.$executeRawUnsafe(
    'UPDATE "Interview" SET "interviewReport" = NULL, "strategicVerdict" = NULL, "aiSummary" = NULL WHERE "applicationId" = $1',
    applicationId
  );

  console.log(`[TEST] Adding job to interview-finalization queue...`);
  const job = await interviewFinalizationQueue.add(
    "finalize-interview",
    { 
      applicationId, 
      interviewStatus: "COMPLETED" 
    },
    {
      attempts: 1,
      removeOnComplete: true,
    }
  );

  console.log(`[TEST] Job queued! ID: ${job.id}`);
  console.log(`[TEST] Please ensure the worker is running (npm run worker:interview).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
