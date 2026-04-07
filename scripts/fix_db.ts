
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Checking and updating database schema...");
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Drive" ADD COLUMN IF NOT EXISTS "isPassportRequired" BOOLEAN DEFAULT false;`);
    console.log("Column 'isPassportRequired' ensured in 'Drive' table.");
    
    await prisma.$executeRawUnsafe(`ALTER TABLE "Drive" ADD COLUMN IF NOT EXISTS "aiScreeningEnabled" BOOLEAN DEFAULT true;`);
    console.log("Column 'aiScreeningEnabled' ensured in 'Drive' table.");
    
    console.log("Database schema update complete.");
  } catch (error) {
    console.error("Error updating database schema:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
