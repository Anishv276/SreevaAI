
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    let app = await prisma.application.findFirst({
        where: { hiringStatus: 'SHORTLISTED' },
        orderBy: { createdAt: 'desc' }
    });

    if (!app) {
        // Try ACCEPTED or standard shortlisted
        app = await prisma.application.findFirst({
            where: { hiringStatus: { in: ['ACCEPTED', 'shortlisted'] } },
            orderBy: { createdAt: 'desc' }
        });
    }

    if (!app) {
        // Last resort: any recent candidate
        app = await prisma.application.findFirst({
            orderBy: { createdAt: 'desc' }
        });
    }

    if (app) {
        console.log(`Interview Link for ${app.fullName}: http://localhost:3000/interview/${app.id}`);
    } else {
        console.log("No candidates found in database.");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
