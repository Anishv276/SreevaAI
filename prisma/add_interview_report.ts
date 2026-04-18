import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Interview"
    ADD COLUMN IF NOT EXISTS "interviewReport" JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Interview_interviewReport_gin_idx"
    ON "Interview"
    USING GIN ("interviewReport");
  `);

  console.log('Interview.interviewReport column and index ensured.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
