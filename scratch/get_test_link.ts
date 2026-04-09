
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const application = await prisma.application.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true }
  });
  
  if (application) {
    console.log('APPLICATION_ID:' + application.id);
  } else {
    console.log('NO_APPLICATION_FOUND');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
