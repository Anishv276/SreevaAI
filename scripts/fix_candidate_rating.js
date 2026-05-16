const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("Converting Interview.candidateRating to JSONB...");

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Interview"
      ALTER COLUMN "candidateRating" TYPE JSONB
      USING to_jsonb("candidateRating");
    `);
    console.log('candidateRating conversion completed.');
  } catch (error) {
    console.error("Candidate rating migration failed:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
