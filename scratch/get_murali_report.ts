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
      interviewReport: true,
      answerScores: true,
    }
  });
  
  if (!interview) {
    console.log("No interview found");
    return;
  }
  
  console.log("Interview Report keys:", Object.keys(interview.interviewReport as object || {}));
  console.log("Interview Report Skills:", (interview.interviewReport as any)?.skills || (interview.interviewReport as any)?.skills_proof);
  console.log("Answer Scores:", interview.answerScores);
}

run().catch(console.error);
