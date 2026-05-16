const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database migration for drive cleanup...");

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Drive"
      DROP COLUMN IF EXISTS "department",
      DROP COLUMN IF EXISTS "type",
      DROP COLUMN IF EXISTS "positions",
      DROP COLUMN IF EXISTS "workMode",
      DROP COLUMN IF EXISTS "status";
    `);
    console.log('Dropped unused columns from "Drive".');

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Drive"
      ADD COLUMN IF NOT EXISTS "deadline" TIMESTAMP(3);
    `);
    console.log('Column "deadline" ensured on "Drive".');

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Interview"
      ALTER COLUMN "candidateRating" TYPE JSONB
      USING to_jsonb("candidateRating");
    `);
    console.log('Column "candidateRating" converted to JSONB on "Interview".');

    console.log("Database migration completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
