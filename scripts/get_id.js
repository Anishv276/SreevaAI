const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
async function main() {
    const latest = await prisma.assessment.findFirst({ orderBy: { createdAt: 'desc' } });
    console.log('---START---');
    if (latest) console.log('LATEST_ID:', latest.id);
    else console.log('NOT_FOUND');
    console.log('---END---');
}
main().catch(console.error).finally(() => prisma.$disconnect());
