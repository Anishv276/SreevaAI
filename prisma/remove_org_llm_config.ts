import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Dropping deprecated Organization LLM config columns...");

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Organization"
      DROP COLUMN IF EXISTS "llmModel",
      DROP COLUMN IF EXISTS "llmTemperature";
    `);
    console.log('Dropped "llmModel" and "llmTemperature" from "Organization".');
  } catch (error) {
    console.error("Failed to remove Organization LLM config columns:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
