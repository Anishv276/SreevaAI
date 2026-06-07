import { prisma } from "../lib/prisma";

async function main() {
  console.log('Migrating Organization.deepgramModel defaults to "flux-general-en"...');

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE IF EXISTS "Organization"
      ALTER COLUMN "deepgramModel" SET DEFAULT 'flux-general-en';
    `);
    console.log('Default for "Organization.deepgramModel" updated to "flux-general-en".');

    const result = await prisma.$executeRawUnsafe(`
      UPDATE "Organization"
      SET "deepgramModel" = 'flux-general-en'
      WHERE "deepgramModel" IS NULL
         OR lower("deepgramModel") NOT IN ('flux-general-en', 'flux-general-multi');
    `);
    console.log(`Rows migrated from non-Flux/empty STT config: ${result}`);

    console.log("Deepgram Flux migration completed successfully.");
  } catch (error) {
    console.error("Deepgram Flux migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
