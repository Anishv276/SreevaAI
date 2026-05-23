import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Organization"
      ADD COLUMN IF NOT EXISTS "interviewMode" TEXT NOT NULL DEFAULT 'DEADLINE';
    `);
    console.log('Ensured Organization.interviewMode');

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Drive"
      ADD COLUMN IF NOT EXISTS "interviewMode" TEXT;
    `);
    console.log('Ensured Drive.interviewMode');

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Interview"
      ADD COLUMN IF NOT EXISTS "linkStatus" TEXT NOT NULL DEFAULT 'ACTIVE';
    `);
    console.log('Ensured Interview.linkStatus');

    console.log("Targeted schema sync completed successfully.");
  } catch (error) {
    console.error("Targeted schema sync failed:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
