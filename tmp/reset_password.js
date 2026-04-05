
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const email = 'vamsi@lumoscale';
  const newPassword = 'Admin@1234';
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  const updated = await prisma.user.update({
    where: { email: email },
    data: { password: hashedPassword }
  });
  
  console.log('Successfully reset password for:', updated.email);
  console.log('You can now log in with Password: ' + newPassword);
}

main()
  .catch(e => {
    console.error('Reset failed:', e);
    process.exit(1);
  })
  .finally(async () => await prisma.$disconnect());
