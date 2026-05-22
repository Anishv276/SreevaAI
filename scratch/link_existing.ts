import { PrismaClient } from "@prisma/client";
import { generateId } from "../lib/ids";
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const applicationId = "app-vamsi-resume-gtm-cmp5hn5-2118";
  
  // 1. Verify application exists
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      interview: true,
      drive: {
        include: {
          organization: {
            select: {
              name: true,
            },
          },
        },
      },
    }
  });

  if (!application) {
    console.error("❌ Application not found:", applicationId);
    return;
  }

  let interview = application.interview;

  // 2. Create interview if it doesn't exist
  if (!interview) {
    console.log("Creating new interview for:", applicationId);
    interview = await prisma.interview.create({
      data: {
        id: generateId("int", application.fullName || application.id),
        applicationId: applicationId,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = new URL(`/interview/${applicationId}`, baseUrl);
  if (interview.accessToken) url.searchParams.set("token", interview.accessToken);
  const orgName = application.drive?.organization?.name || "Sreeva AI";
  if (orgName) url.searchParams.set("orgName", orgName);
  const interviewLink = url.toString();

  console.log("\n✅ INTERVIEW LINK READY");
  console.log("-----------------------------");
  console.log(`Candidate: ${application.fullName}`);
  console.log(`Link:      ${interviewLink}`);
  console.log("-----------------------------\n");
}

main().catch(console.error).finally(() => prisma.$disconnect());
