import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database migration...");

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Interview"
      ADD COLUMN IF NOT EXISTS "aiSummary" TEXT;
    `);
    console.log('Column "aiSummary" ensured.');

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Interview"
      ADD COLUMN IF NOT EXISTS "interviewTurns" JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    console.log('Column "interviewTurns" ensured.');

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Interview"
      ADD COLUMN IF NOT EXISTS "aiScore" INTEGER;
    `);
    console.log('Column "aiScore" ensured.');

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Interview"
      ALTER COLUMN "candidateRating" TYPE JSONB
      USING to_jsonb("candidateRating");
    `);
    console.log('Column "candidateRating" converted to JSONB.');

    console.log("Database migration completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
