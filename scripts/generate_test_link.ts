import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { generateId } from '../lib/ids';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const application = await prisma.application.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { interview: true }
  });

  if (!application) {
    console.log('No applications found.');
    return;
  }

  let interview = application.interview;
  if (!interview) {
    console.log('Creating interview for application:', application.id);
    interview = await prisma.interview.create({
      data: {
        id: generateId("int", application.fullName || application.id),
        applicationId: application.id,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days
      }
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sreevaai.com';
  const link = `${baseUrl}/interview/${application.id}?token=${interview.accessToken}`;

  console.log('--- TEST INTERVIEW LINK ---');
  console.log('Candidate:', application.fullName);
  console.log('Email:', application.email);
  console.log('Link:', link);
  console.log('---------------------------');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
