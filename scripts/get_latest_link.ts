import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const latestApplication = await prisma.application.findFirst({
    orderBy: { appliedAt: "desc" },
    include: { job: true, interview: true },
  });
  if (!latestApplication) {
    console.log("No applications found in the database.");
    return;
  }
  const interviewLink = `https://sreevaai.com/interview/${latestApplication.id}${latestApplication.interview ? `?token=${latestApplication.interview.candidateInviteToken}` : ''}`;
  console.log("--- LATEST CANDIDATE ---");
  console.log(`Name: ${latestApplication.candidateFullName}`);
  console.log(`Email: ${latestApplication.candidateEmail}`);
  console.log(`Applied for: ${latestApplication.job.title}`);
  console.log(`Application ID: ${latestApplication.id}`);
  console.log("-----------------------");
  console.log(`\n👉 TEST INTERVIEW LINK: ${interviewLink}\n`);
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
