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
    interviewStatus: app.interviewStatus,
    interview: app.interview ? {
      status: app.interview.status,
      accessToken: app.interview.accessToken,
      expiresAt: app.interview.expiresAt
    } : "No interview record"
  });
}
main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
