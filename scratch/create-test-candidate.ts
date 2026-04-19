import { PrismaClient } from '@prisma/client';
import { generateId } from "../lib/ids";

const prisma = new PrismaClient();

async function main() {
  const drive = await prisma.drive.findFirst();
  if (!drive) {
    console.error('No drives found');
    return;
  }

  const application = await prisma.application.create({
    data: {
      id: generateId("app", "Vamsi Fresh Test"),
      fullName: 'Vamsi Fresh Test',
      email: 'vamsi_fresh@example.com',
      phone: '9999999999',
      resumeStatus: 'pending',
      interviewStatus: 'pending',
      hiringStatus: 'pending',
      driveId: drive.id,
      resumeText: 'Experimental Test Resume',
      resumeUrl: 'https://example.com/test-resume.pdf'
    }
  });

  console.log('APPLICATION_ID:' + application.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
