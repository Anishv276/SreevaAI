import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

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
        applicationId: application.id,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days
      }
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
