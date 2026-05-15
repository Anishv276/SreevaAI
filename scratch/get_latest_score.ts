import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const cand = await prisma.resumeCandidate.findFirst({
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            fullName: true,
            aiScore: true,
            resumeStatus: true,
            aiReport: true
        }
    });

    console.log("Candidate ID:", cand?.id);
    console.log("Candidate Name:", cand?.fullName);
    console.log("Candidate Score:", cand?.aiScore);
    console.log("Candidate Status:", cand?.resumeStatus);
    
    if (cand?.aiReport) {
        const report = JSON.parse(cand.aiReport);
        console.log("\nFull AI Report:");
        console.log(JSON.stringify(report, null, 2));
    }
}

main().finally(() => prisma.$disconnect());
