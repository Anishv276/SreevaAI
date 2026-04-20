import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const appId = "app-vadla-vamsi-krishna-2525";
  console.log(`Resetting and extending session for ${appId}...`);
  
  // Extend by 2 hours and reset to STARTED
  const updated = await prisma.interview.update({
    where: { applicationId: appId },
    data: {
      status: "STARTED",
      expiresAt: new Date(Date.now() + (2 * 60 * 60 * 1000)),
      completedAt: null
    }
  });
  
  // also update application status
  await prisma.application.update({
    where: { id: appId },
    data: {
      interviewStatus: "PENDING"
    }
  });
  
  console.log("Updated record:", {
    appId: updated.applicationId,
    status: updated.status,
    expiresAt: updated.expiresAt
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
