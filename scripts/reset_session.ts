import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const appId = "app-vadla-vamsi-krishna-2525";
  console.log(`Resetting and extending session for ${appId}...`);

  const updated = await prisma.interview.update({
    where: { applicationId: appId },
    data: {
      interviewStatus: "STARTED",
      inviteLinkExpiresAt: new Date(Date.now() + (2 * 60 * 60 * 1000)),
      interviewCompletedAt: null,
    }
  });

  await prisma.application.update({
    where: { id: appId },
    data: {
      interviewPhaseStatus: "PENDING"
    }
  });

  console.log("Updated record:", {
    appId: updated.applicationId,
    interviewStatus: updated.interviewStatus,
    inviteLinkExpiresAt: updated.inviteLinkExpiresAt,
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
