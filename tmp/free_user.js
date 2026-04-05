
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'vamsivk1465@gmail.com';
  
  // Wipe out any existing user record with this email so it can be re-invited/re-created
  await prisma.user.deleteMany({
    where: { email: email }
  });
  
  // Also wipe out any pending invites for it
  await prisma.orgInvite.deleteMany({
    where: { email: email }
  });
  
  console.log('Successfully liberated email:', email);
}

main()
  .catch(e => {
    console.error('Liberation failed:', e);
    process.exit(1);
  })
  .finally(async () => await prisma.$disconnect());
