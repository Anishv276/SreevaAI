
import { prisma } from "../lib/prisma";

async function main() {
  const candidates: any[] = await prisma.interview.findMany({
    where: {
      status: "COMPLETED",
    },
    select: {
      applicationId: true,
      application: {
        select: {
          fullName: true,
        },
      },
    },
  } as any);

  if (candidates.length === 0) {
    console.log("No candidates found with completed interview but missing report.");
  } else {
    console.log("Found candidates missing reports:");
    candidates.forEach((c) => {
      console.log(`- ${c.application?.fullName || "Unknown"} (ID: ${c.applicationId})`);
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
