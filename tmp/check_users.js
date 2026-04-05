
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, orgId: true } });
  console.log('All Users:', JSON.stringify(users, null, 2));

  const orgs = await prisma.organization.findMany();
  console.log('All Orgs:', JSON.stringify(orgs, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
