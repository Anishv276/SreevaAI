import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Step 1: Checking/adding missing columns...");

  const textCols = [
    "role", "interviewLanguage", "interviewQuestions",
    "proctoringLevel", "salary", "experience",
    "responsibilities", "requirements", "skills",
    "extractedDetails", "registrationFields", "workMode",
    "description", "department",
  ];
  const intCols = ["interviewTime", "positions", "screeningThreshold"];
  const boolCols = ["interviewEnabled"];

  for (const col of textCols) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Drive" ADD COLUMN IF NOT EXISTS "${col}" TEXT`);
      console.log("  ✅ " + col);
    } catch (e) {
      console.log("  ❌ " + col + " — " + e.message.split("\n")[0]);
    }
  }
  for (const col of intCols) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Drive" ADD COLUMN IF NOT EXISTS "${col}" INTEGER DEFAULT 0`);
      console.log("  ✅ " + col);
    } catch (e) {
      console.log("  ❌ " + col + " — " + e.message.split("\n")[0]);
    }
  }
  for (const col of boolCols) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Drive" ADD COLUMN IF NOT EXISTS "${col}" BOOLEAN DEFAULT true`);
      console.log("  ✅ " + col);
    } catch (e) {
      console.log("  ❌ " + col + " — " + e.message.split("\n")[0]);
    }
  }

  console.log("\nStep 2: Dropping obsolete columns if they exist...");
  const dropCols = [
    "location", "assessmentCount", "assessmentDifficulty",
    "assessmentTypes", "assessmentTime", "assessmentMode",
    "proctoringEnabled", "webcamMonitoring", "aiScreeningWeights",
    "aiFollowUpDepth",
  ];
  for (const col of dropCols) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Drive" DROP COLUMN IF EXISTS "${col}"`);
      console.log("  🗑  dropped " + col);
    } catch (e) {
      console.log("  ⚠  " + col + " — " + e.message.split("\n")[0]);
    }
  }

  console.log("\nStep 3: Test-fetching drives...");
  try {
    const drives = await prisma.drive.findMany({
      include: { _count: { select: { applications: true } } },
    });
    console.log("  ✅ Successfully fetched", drives.length, "drive(s).");
    if (drives.length > 0) {
      console.log("  Sample drive fields:", Object.keys(drives[0]));
    }
  } catch (e) {
    console.error("  ❌ FETCH FAILED:", e.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
