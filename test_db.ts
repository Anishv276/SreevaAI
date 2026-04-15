import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const apps = await prisma.application.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { drive: true }
  });
  console.log("Recent Applications:");
  for (const app of apps) {
     console.log(`- ID: ${app.id}, Candidate: ${app.fullName}, Drive: ${app.drive.title}`);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
