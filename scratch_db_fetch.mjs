import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync, writeFileSync } from 'fs';
import { config } from 'dotenv';
config();

const SUPABASE_CA = readFileSync('certs/supabase-root-ca.pem', 'utf8');
const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const url = new URL(databaseUrl);
url.searchParams.set('uselibpqcompat', 'true');
url.searchParams.delete('sslmode');
url.searchParams.delete('connect_timeout');
url.searchParams.delete('connection_limit');
const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
const adapter = new PrismaPg({
    connectionString: url.toString(),
    ssl: isLocal ? false : { rejectUnauthorized: true, ca: SUPABASE_CA },
});
const prisma = new PrismaClient({ adapter });

const job = await prisma.job.findFirst({
    where: { questionBank: { not: null }, isDeleted: false },
    orderBy: { jobCreatedAt: 'desc' },
    select: {
        id: true, title: true, level: true, questionBank: true,
        applications: {
            where: { resumeParsedData: { not: null } },
            select: { id: true, candidateFullName: true, resumeParsedData: true },
            take: 1,
        },
    },
});

const out = !job ? { error: 'NO_JOB_WITH_BANK' } : {
    jobId: job.id, title: job.title, level: job.level,
    questionBank: job.questionBank, application: job.applications[0] || null,
};
writeFileSync('scratch_db_result.json', JSON.stringify(out, null, 0), 'utf8');
console.log('wrote scratch_db_result.json,', JSON.stringify(out).length, 'chars');
await prisma.$disconnect();
