import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Get or create a default drive
  let drive = await prisma.drive.findFirst();
  
  if (!drive) {
    const creator = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!creator) {
      console.error("No admin user found to create a drive.");
      return;
    }
    
    drive = await prisma.drive.create({
      data: {
        title: "Senior AI Engineer",
        description: "Looking for someone to build next-gen AI agents.",
        department: "Engineering",
        location: "Remote",
        creatorId: creator.id,
        skills: "Python, LiveKit, OpenAI, TypeScript",
      }
    });
  }

  const timestamp = Date.now();
  const testName = `Test Candidate ${timestamp}`;
  const testEmail = `test_${timestamp}@example.com`;

  // 2. Create Application
  const application = await prisma.application.create({
    data: {
      fullName: testName,
      email: testEmail,
      phone: "+1234567890",
      resumeUrl: "https://example.com/resume.pdf",
      driveId: drive.id,
      status: "Shortlisted",
    }
  });

  // 3. Create Assessment
  const assessment = await prisma.assessment.create({
    data: {
      applicationId: application.id,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    }
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const interviewLink = `${baseUrl}/careers/interview/${assessment.id}`;

  console.log("\n✅ NEW TEST CANDIDATE CREATED");
  console.log("-----------------------------");
  console.log(`Name:  ${testName}`);
  console.log(`Email: ${testEmail}`);
  console.log(`Drive: ${drive.title}`);
  console.log(`ID:    ${assessment.id}`);
  console.log("-----------------------------");
  console.log(`\n👉 INTERVIEW LINK: ${interviewLink}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
