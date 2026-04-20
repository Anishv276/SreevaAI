import { PrismaClient } from '@prisma/client';
import { generateId } from '../lib/ids';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  // Look for existing Vamsi application first
  let application: any = await prisma.application.findFirst({
    where: { fullName: { contains: 'Vamsi', mode: 'insensitive' } },
    include: { interview: true },
    orderBy: { createdAt: 'desc' }
  });

  if (application) {
    console.log('Found existing application for:', application.fullName);
    let interview = application.interview;
    if (!interview) {
      interview = await (prisma as any).interview.create({
        data: {
          id: generateId('int', application.fullName),
          applicationId: application.id,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }
      });
    }
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const link = baseUrl + '/interview/' + application.id + '?token=' + interview.accessToken;
    console.log('\n✅ INTERVIEW LINK FOR ' + application.fullName);
    console.log('Link:', link, '\n');
    return;
  }

  // Nothing found - create fresh candidate
  const drive = await prisma.drive.findFirst();
  if (!drive) {
    console.error('No drive found. Please create a drive first.');
    return;
  }

  application = await prisma.application.create({
    data: {
      id: generateId('app', 'Vamsi Krishna'),
      fullName: 'Vamsi Krishna',
      email: 'vamsi.krishna.test@example.com',
      phone: '+919999999999',
      resumeUrl: 'https://example.com/vamsi-resume.pdf',
      driveId: drive.id,
      resumeStatus: 'SHORTLISTED',
    }
  });

  const interview = await (prisma as any).interview.create({
    data: {
      id: generateId('int', 'Vamsi Krishna'),
      applicationId: application.id,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const link = baseUrl + '/interview/' + application.id + '?token=' + interview.accessToken;

  console.log('\n✅ NEW TEST CANDIDATE CREATED: Vamsi Krishna');
  console.log('Drive:', drive.title);
  console.log('Application ID:', application.id);
  console.log('\n👉 INTERVIEW LINK: ' + link + '\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
