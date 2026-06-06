require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const connectionUrl = new URL(databaseUrl);
  connectionUrl.searchParams.set("uselibpqcompat", "true");
  connectionUrl.searchParams.set("sslmode", "require");
  connectionUrl.searchParams.delete("connect_timeout");
  connectionUrl.searchParams.delete("connection_limit");

  const adapter = new PrismaPg({
    connectionString: connectionUrl.toString(),
    connectionTimeoutMillis: 15000,
    max: 3,
    idleTimeoutMillis: 30000,
  });

  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
}

const prisma = createPrismaClient();

async function main() {
  console.log("Starting recording retention migration...");

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Organization"
      ADD COLUMN IF NOT EXISTS "recordingEnabled" BOOLEAN,
      ADD COLUMN IF NOT EXISTS "recordingRetentionDays" INTEGER;
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Organization"
      ALTER COLUMN "recordingEnabled" DROP DEFAULT,
      ALTER COLUMN "recordingEnabled" DROP NOT NULL,
      ALTER COLUMN "recordingRetentionDays" DROP DEFAULT,
      ALTER COLUMN "recordingRetentionDays" DROP NOT NULL;
    `);

    await prisma.$executeRawUnsafe(`
      UPDATE "Organization"
      SET "recordingEnabled" = NULL,
          "recordingRetentionDays" = NULL;
    `);
    console.log('Ensured Organization recording controls.');

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Interview"
      ADD COLUMN IF NOT EXISTS "recordingRetentionDays" INTEGER,
      ADD COLUMN IF NOT EXISTS "recordingRetentionDueAt" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "recordingCleanupStatus" TEXT,
      ADD COLUMN IF NOT EXISTS "recordingCleanupAttempts" INTEGER,
      ADD COLUMN IF NOT EXISTS "recordingCleanupLastError" TEXT,
      ADD COLUMN IF NOT EXISTS "recordingDeletedAt" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "recordingStatus" TEXT,
      ADD COLUMN IF NOT EXISTS "recordingManifest" JSONB;
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Interview"
      ALTER COLUMN "recordingStatus" DROP DEFAULT,
      ALTER COLUMN "recordingManifest" DROP DEFAULT,
      ALTER COLUMN "recordingCleanupStatus" DROP DEFAULT,
      ALTER COLUMN "recordingCleanupStatus" DROP NOT NULL,
      ALTER COLUMN "recordingCleanupAttempts" DROP DEFAULT,
      ALTER COLUMN "recordingCleanupAttempts" DROP NOT NULL;
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
