const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function find() {
  const c = await prisma.application.findMany({
    where: { fullName: { contains: 'Vadla Vamsi Krishna', mode: 'insensitive' } },
    take: 1
  });
  console.log(JSON.stringify(c, null, 2));
}

find().finally(() => prisma.$disconnect());
