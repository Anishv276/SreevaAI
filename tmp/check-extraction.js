
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const app = await prisma.application.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { fullName: true, structuredResume: true }
    });
    
    if (!app) {
        console.log('No applications found.');
        return;
    }
    
    console.log('--- CANDIDATE ---');
    console.log('Name:', app.fullName);
    
    try {
        const resume = JSON.parse(app.structuredResume || '{}');
        console.log('Experience:', JSON.stringify(resume.experience, null, 2));
        console.log('Education:', JSON.stringify(resume.education, null, 2));
        console.log('Work History Count:', resume.work_history?.length || 0);
    } catch (e) {
        console.log('Error parsing structuredResume:', e.message);
        console.log('Raw:', app.structuredResume);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
