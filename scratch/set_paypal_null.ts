import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.organization.update({
    where: { slug: 'paypal' },
    data: { isDomainVerified: null }
  });
  console.log('Update result:', JSON.stringify(result, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
