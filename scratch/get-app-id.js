const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const app = await prisma.application.findFirst({
    select: { id: true }
  });
  if (app) {
    console.log(`APPLICATION_ID: ${app.id}`);
  } else {
    console.log('No applications found.');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
