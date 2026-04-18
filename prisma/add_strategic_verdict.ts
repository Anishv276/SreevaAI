import { prisma } from "@/lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Interview"
    ADD COLUMN IF NOT EXISTS "strategicVerdict" JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Interview_strategicVerdict_gin_idx"
    ON "Interview"
    USING GIN ("strategicVerdict");
  `);

  console.log('Interview.strategicVerdict column and index ensured.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
