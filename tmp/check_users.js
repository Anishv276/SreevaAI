
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const superAdmins = await prisma.superAdmin.findMany();
  console.log('SuperAdmins:', JSON.stringify(superAdmins, null, 2));
  
  const users = await prisma.user.findMany({
    where: { email: { contains: 'admin' } }
  });
  console.log('Users with "admin" in email:', JSON.stringify(users, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
