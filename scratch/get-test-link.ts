
import { prisma } from "../lib/prisma";

async function main() {
  const interview = await prisma.interview.findFirst({
    include: {
      application: true
    }
  });

  if (!interview) {
    console.log("No interviews found in the database.");
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sreevaai.com";
  const link = `${baseUrl}/interview/${interview.applicationId}?token=${interview.accessToken}`;
  console.log("TEST_LINK_START");
  console.log(link);
  console.log("TEST_LINK_END");
}

main().catch(console.error);
