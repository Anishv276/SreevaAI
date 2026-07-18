import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const rows = await prisma.usageEvent.findMany({
    where: { candidateName: { contains: "Vamsi", mode: "insensitive" } },
    select: { id: true, eventId: true, feature: true, jobId: true, applicationId: true, candidateName: true, jobTitle: true, usage: true, createdAt: true },
  });
  console.log(JSON.stringify(rows, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
