import { prisma } from './lib/prisma';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const apps = await prisma.application.findMany({
    where: {
      fullName: {
        contains: 'vadla vamsi krishna',
        mode: 'insensitive'
      }
    },
    include: {
      interview: true
    }
  });
  console.log(JSON.stringify(apps, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
