import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting recording retention migration...");

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Organization"
      ADD COLUMN IF NOT EXISTS "recordingEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS "recordingRetentionDays" INTEGER NOT NULL DEFAULT 30;
    `);
    console.log('Ensured Organization recording controls.');

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Interview"
      ADD COLUMN IF NOT EXISTS "recordingRetentionDays" INTEGER,
      ADD COLUMN IF NOT EXISTS "recordingRetentionDueAt" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "recordingCleanupStatus" TEXT NOT NULL DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS "recordingCleanupAttempts" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "recordingCleanupLastError" TEXT,
      ADD COLUMN IF NOT EXISTS "recordingDeletedAt" TIMESTAMP;
    `);
    console.log('Ensured Interview recording retention fields.');

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Interview_recordingRetentionDueAt_idx"
      ON "Interview" ("recordingRetentionDueAt")
      WHERE "recordingDeletedAt" IS NULL AND "interviewRecordingUrl" IS NOT NULL;
    `);
    console.log('Ensured Interview retention due index.');

    console.log("Recording retention migration completed successfully.");
  } catch (error) {
    console.error("Recording retention migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
