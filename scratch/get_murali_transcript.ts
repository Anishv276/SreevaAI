import { prisma } from "../lib/prisma";

async function run() {
  const interview = await prisma.interview.findFirst({
    where: {
      application: {
        fullName: {
          contains: "Murali",
          mode: "insensitive"
        }
      }
    },
    select: {
      interviewTranscript: true,
      interviewDuration: true,
      recordingDurationSec: true,
    }
  });
  
  if (!interview) {
    console.log("No interview found");
    return;
  }
  
  console.log("Duration:", interview.interviewDuration);
  console.log("Recording Duration Sec:", interview.recordingDurationSec);
  console.log("Transcript preview:");
  console.log(interview.interviewTranscript?.split("\n").slice(0, 10).join("\n"));
}

run().catch(console.error);
