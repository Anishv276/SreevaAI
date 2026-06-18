import { config } from "dotenv";
config();
async function main() {
  const { prisma } = await import("./lib/prisma");
  const org = await prisma.organization.findFirst();
  console.log(JSON.stringify((org?.usageMetrics as any)?.billing, null, 2));
  await prisma.$disconnect();
}
main().catch(console.error);
