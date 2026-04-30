import { PrismaClient } from "@prisma/client";
import { generateId } from "../lib/ids";

const prisma = new PrismaClient();

async function main() {
  // 1. Get or create a default organization
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: {
        id: generateId("org", "Default Org"),
        name: "Default Org",
        slug: "default-org-" + Math.floor(Math.random() * 1000),
      }
    });
  }

  // 2. Get or create a default admin user
  let creator = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!creator) {
    creator = await prisma.user.create({
      data: {
        id: "admin-" + Math.floor(Math.random() * 1000),
        email: "admin@sreeva.com",
        name: "Default Admin",
        role: "ADMIN",
        orgId: org.id,
      }
    });
  }

  // 3. Get or create a default drive
  let drive = await prisma.drive.findFirst();
  if (!drive) {
    drive = await prisma.drive.create({
      data: {
        id: generateId("drv", "Senior AI Engineer"),
        title: "Senior AI Engineer",
        description: "Looking for someone to build next-gen AI agents.",
        department: "Engineering",
        workMode: "Remote",
        creatorId: creator.id,
        skills: "Python, LiveKit, OpenAI, TypeScript",
        orgId: org.id,
      }
    });
  }

  const timestamp = Date.now();
  const argName = process.argv[2];
  const testName = argName || `Test Candidate ${timestamp}`;
  const testEmail = argName 
    ? `${argName.toLowerCase().replace(/\s+/g, "_")}_${timestamp}@example.com`
    : `test_${timestamp}@example.com`;

  // 4. Create Application
  const application = await prisma.application.create({
    data: {
      id: generateId("app", testName),
      fullName: testName,
      email: testEmail,
      phone: "+1234567890",
      resumeUrl: "https://example.com/resume.pdf",
      driveId: drive.id,
      resumeStatus: "shortlisted",
    }
  });

  // 5. Create Interview
  const interview = await prisma.interview.create({
    data: {
      id: generateId("int", application.fullName || application.id),
      applicationId: application.id,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    }
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sreevaai.com";
  const interviewLink = `${baseUrl}/interview/${application.id}?token=${interview.accessToken}`;

  console.log("\n✅ NEW TEST CANDIDATE CREATED");
  console.log("-----------------------------");
  console.log(`Name:  ${testName}`);
  console.log(`Email: ${testEmail}`);
  console.log(`Drive: ${drive.title}`);
  console.log(`Application ID: ${application.id}`);
  console.log(`Interview ID:   ${interview.id}`);
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
