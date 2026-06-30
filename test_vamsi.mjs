import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const apps = await prisma.application.findMany({
    where: {
      fullName: {
        contains: 'vamsi krishna',
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
