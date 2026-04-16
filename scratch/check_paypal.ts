import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findUnique({
    where: { slug: 'paypal' }
  });
  console.log('Paypal Org:', JSON.stringify(org, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
