import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Fetching the 3 most recent interviews...");
  const interviews = await prisma.interview.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: {
      application: true
    }
  });

  for (const interview of interviews) {
    console.log(`\n========================================`);
    console.log(`Interview ID: ${interview.id}`);
    console.log(`Candidate Name: ${interview.application.fullName} (${interview.application.email})`);
    console.log(`Status: ${interview.status}`);
    console.log(`Started At: ${interview.startedAt}`);
    console.log(`Completed At: ${interview.completedAt}`);
    console.log(`Duration: ${interview.interviewDuration} seconds`);
    console.log(`Recording Status: ${interview.recordingStatus}`);
    console.log(`Recording URL: ${interview.interviewRecordingUrl}`);
    console.log(`Transcript Length: ${interview.interviewTranscript ? interview.interviewTranscript.length : 0} chars`);
    console.log(`Report Keys: ${interview.interviewReport ? Object.keys(interview.interviewReport as object).join(', ') : 'none'}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
