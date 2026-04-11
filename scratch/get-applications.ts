import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const prisma = new PrismaClient();
  try {
    const applications = await prisma.application.findMany({
      take: 5,
      select: {
        id: true,
        fullName: true,
        email: true,
      }
    });
    console.log(JSON.stringify(applications, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
