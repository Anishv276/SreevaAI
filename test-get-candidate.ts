import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const interview = await prisma.interview.findFirst({
    where: { status: "PENDING" },
    include: { application: true }
  });
  if (interview) {
    console.log(`URL: http://localhost:3000/interview/${interview.applicationId}?token=${interview.accessToken}`);
  } else {
    console.log("No pending interviews found.");
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
