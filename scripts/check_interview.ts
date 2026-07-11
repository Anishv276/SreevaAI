import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const appId = "app-vadla-vamsi-krishna-2525";
  console.log(`Checking status for ${appId}...`);
  const app = await prisma.application.findUnique({
    where: { id: appId },
    include: { interview: true }
  });
  if (!app) {
    console.log("Application not found.");
    return;
  }
  console.log("Application detail:", {
    id: app.id,
    interviewPhaseStatus: app.interviewPhaseStatus,
    interview: app.interview ? {
      interviewStatus: app.interview.interviewStatus,
      candidateInviteToken: app.interview.candidateInviteToken,
      inviteLinkExpiresAt: app.interview.inviteLinkExpiresAt
    } : "No interview record"
  });
}
main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
