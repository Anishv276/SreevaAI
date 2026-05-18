import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const interview = await prisma.interview.findUnique({
    where: { id: "int-vadla-vamsi-krishna-9541" }
  });

  if (interview) {
    console.log("Interview ID:", interview.id);
    console.log("Recording Status:", interview.recordingStatus);
    console.log("Recording URL:", interview.interviewRecordingUrl);
    console.log("Recording Manifest:", JSON.stringify(interview.recordingManifest, null, 2));
  } else {
    console.log("Interview not found!");
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
