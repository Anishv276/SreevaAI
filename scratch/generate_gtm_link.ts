import { PrismaClient } from "@prisma/client";
import { generateId } from "../lib/ids";
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const driveId = "drv-gtm-engineer-recruitment-3350";
  const candidateName = "vadla vamsi krishna";
  const timestamp = Date.now();
  const testEmail = `vadla_vamsi_krishna_gtm_${timestamp}@example.com`;

  const drive = await prisma.drive.findUnique({ where: { id: driveId } });
  const driveWithOrg = drive
    ? await prisma.drive.findUnique({
        where: { id: driveId },
        include: {
          organization: {
            select: {
              name: true,
            },
          },
        },
      })
    : null;
  if (!drive) {
    console.error("Drive not found:", driveId);
    return;
  }

  // Create Application
  const application = await prisma.application.create({
    data: {
      id: generateId("app", candidateName),
      fullName: candidateName,
      email: testEmail,
      phone: "+1234567890",
      resumeUrl: "https://example.com/resume.pdf",
      driveId: drive.id,
      resumeStatus: "shortlisted",
    }
  });

  // Create Interview
  const interview = await prisma.interview.create({
    data: {
      id: generateId("int", application.fullName || application.id),
      applicationId: application.id,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    }
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = new URL(`/interview/${application.id}`, baseUrl);
  if (interview.accessToken) url.searchParams.set("token", interview.accessToken);
  const orgName = driveWithOrg?.organization?.name || "Sreeva AI";
  if (orgName) url.searchParams.set("orgName", orgName);
  const interviewLink = url.toString();

  console.log("\n✅ GTM INTERVIEW LINK GENERATED");
  console.log("-----------------------------");
  console.log(`Candidate: ${candidateName}`);
  console.log(`Drive:     ${drive.title}`);
  console.log(`Link:      ${interviewLink}`);
  console.log("-----------------------------\n");
}

main().catch(console.error).finally(() => prisma.$disconnect());
