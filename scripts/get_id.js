const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
async function main() {
    const latest = await prisma.interview.findFirst({ orderBy: { createdAt: 'desc' } });
    console.log('---START---');
    if (latest) {
        console.log('LATEST_INTERVIEW_ID:', latest.id);
        console.log('LATEST_APPLICATION_ID:', latest.applicationId);
    }
    else console.log('NOT_FOUND');
    console.log('---END---');
}
main().catch(console.error).finally(() => prisma.$disconnect());
