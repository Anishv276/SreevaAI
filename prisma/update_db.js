const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database migration for drive deadline...");

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Drive"
      ADD COLUMN IF NOT EXISTS "deadline" TIMESTAMP(3);
    `);
    console.log('Column "deadline" ensured on "Drive".');

    console.log("Database migration completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
