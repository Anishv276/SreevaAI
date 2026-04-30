import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const latestApplication = await prisma.application.findFirst({
    orderBy: { createdAt: "desc" },
    include: { drive: true, interview: true },
  });

  if (!latestApplication) {
    console.log("No applications found in the database.");
    return;
  }

  const interviewLink = `https://sreevaai.com/interview/${latestApplication.id}${latestApplication.interview ? `?token=${latestApplication.interview.accessToken}` : ''}`;
  
  console.log("--- LATEST CANDIDATE ---");
  console.log(`Name: ${latestApplication.fullName}`);
  console.log(`Email: ${latestApplication.email}`);
  console.log(`Applied for: ${latestApplication.drive.title}`);
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
