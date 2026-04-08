import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const latestApplication = await prisma.application.findFirst({
    orderBy: { createdAt: "desc" },
    include: { drive: true },
  });

  if (!latestApplication) {
    console.log("No applications found in the database.");
    return;
  }

  const interviewLink = `http://localhost:3000/interview/${latestApplication.id}`;
  
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
