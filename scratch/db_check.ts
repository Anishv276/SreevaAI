import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Searching for "INR LPA" in Drive table...');
  const drives = await prisma.drive.findMany({
    where: {
      OR: [
        { salary: { contains: 'INR LPA', mode: 'insensitive' } },
        { extractedDetails: { contains: 'INR LPA', mode: 'insensitive' } }
      ]
    }
  });
  console.log(`Found ${drives.length} drives with "INR LPA"`);
  drives.forEach(d => {
    console.log(`- Drive ${d.id}: salary=${d.salary}`);
  });

  console.log('\nSearching for "INR LPA" in Application table...');
  // Since submissionData is Json, we might need a raw query or just fetch some to check
  const applications = await prisma.application.findMany({
    where: {
        OR: [
            { submissionData: { path: ['currentCtc'], string_contains: 'INR LPA' } },
            { submissionData: { path: ['expectedCtc'], string_contains: 'INR LPA' } }
        ]
    }
  });
  console.log(`Found ${applications.length} applications with "INR LPA" in submissionData`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
