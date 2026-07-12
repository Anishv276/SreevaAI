import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'fs';

const ca = readFileSync('./certs/supabase-root-ca.pem', 'utf8');
const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
url.searchParams.set('uselibpqcompat', 'true');
url.searchParams.delete('sslmode');
const adapter = new PrismaPg({ connectionString: url.toString(), ssl: { rejectUnauthorized: true, ca } });
const prisma = new PrismaClient({ adapter });

const interview = await prisma.interview.findFirst({
  where: { interviewScheduledAt: { not: null }, isTestSession: false },
  select: { applicationId: true, interviewScheduledAt: true, isTestSession: true, aiInterviewBrief: true },
  orderBy: { interviewCreatedAt: 'desc' },
});
console.log(JSON.stringify({ ...interview, aiInterviewBrief: interview?.aiInterviewBrief ? '(present)' : null }, null, 2));
await prisma.$disconnect();
