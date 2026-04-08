
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const app = await prisma.application.findFirst({
        where: { status: 'REJECTED' },
        orderBy: { createdAt: 'desc' },
        select: { fullName: true, aiScore: true, aiReport: true }
    });
    
    if (!app) {
        console.log('No rejected applications found.');
        return;
    }
    
    console.log('--- REJECTION ANALYSIS ---');
    console.log('Candidate:', app.fullName);
    console.log('Score:', app.aiScore);
    
    try {
        const report = JSON.parse(app.aiReport || '{}');
        console.log('Final Status from AI:', report.status);
        console.log('Rejection Reasons:', report.rejection_reasons);
        console.log('AI Verdict:', report.ai_verdict || report.reasoning);
    } catch (e) {
        console.log('Error parsing aiReport:', e.message);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
