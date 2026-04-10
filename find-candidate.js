const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function find() {
  const a = await prisma.application.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true }
  });
  if (a) {
    console.log(a.id);
  } else {
    console.log('No application found');
  }
}

find().finally(() => prisma.$disconnect());
