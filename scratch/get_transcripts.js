const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const interviews = await prisma.interview.findMany({
      where: { interviewTranscript: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { 
        interviewTranscript: true,
        updatedAt: true,
        application: {
          select: { fullName: true, email: true }
        }
      }
    });

    if (interviews.length === 0) {
      console.log('No transcripts found in the database.');
      return;
    }

    interviews.forEach((interview, index) => {
      console.log(`--- Transcript ${index + 1} (${interview.application.fullName} - ${interview.updatedAt}) ---`);
      console.log(interview.interviewTranscript);
      console.log('-----------------------------\n');
    });
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
