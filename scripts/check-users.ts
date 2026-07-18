import { prisma } from "../lib/prisma";

async function main() {
  const admins = await prisma.superAdmin.findMany();
  console.log("SuperAdmins:", admins);
  const orgs = await prisma.organizationCredentials.findMany();
  console.log("OrgCreds:", orgs);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
