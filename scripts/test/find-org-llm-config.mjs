import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'fs';

const ca = readFileSync('./certs/supabase-root-ca.pem', 'utf8');
const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
url.searchParams.set('uselibpqcompat', 'true');
url.searchParams.delete('sslmode');
const adapter = new PrismaPg({ connectionString: url.toString(), ssl: { rejectUnauthorized: true, ca } });
const prisma = new PrismaClient({ adapter });

const appId = process.argv[2];
const interview = await prisma.interview.findUnique({
  where: { applicationId: appId },
  select: {
    applicationId: true,
    application: {
      select: {
        job: {
          select: {
            organizationId: true,
            organization: { select: { llmInterviewReport: true, name: true } },
          },
        },
      },
    },
  },
});
console.log(JSON.stringify(interview, null, 2));
await prisma.$disconnect();
