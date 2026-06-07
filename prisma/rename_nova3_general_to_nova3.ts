import { prisma } from "../lib/prisma";

async function main() {
  console.log('Normalizing Organization.deepgramModel from "nova-3-general" to "nova-3"...');

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE IF EXISTS "Organization"
      ALTER COLUMN "deepgramModel" SET DEFAULT 'nova-3';
    `);
    console.log('Default for "Organization.deepgramModel" updated to "nova-3".');

    const result = await prisma.$executeRawUnsafe(`
      UPDATE "Organization"
      SET "deepgramModel" = 'nova-3'
      WHERE lower(COALESCE("deepgramModel", '')) = 'nova-3-general';
    `);
    console.log(`Rows normalized from legacy alias: ${result}`);

    console.log("Deepgram model rename migration completed successfully.");
  } catch (error) {
    console.error("Deepgram model rename migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
