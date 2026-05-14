import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const appId = "app-vamsi-resume-gtm-cmp5hn5-2118";
  const result = await prisma.$queryRaw`
    SELECT a.id, a."fullName", 
           a."resumeData" IS NOT NULL as has_resume,
           d."extractedDetails" IS NOT NULL as has_jd
    FROM "Application" a
    JOIN "Drive" d ON a."driveId" = d.id
    WHERE a.id = ${appId}
  `;
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
