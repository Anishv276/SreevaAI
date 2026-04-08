
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    let app = await prisma.application.findFirst({
        where: { status: 'SHORTLISTED' },
        orderBy: { createdAt: 'desc' }
    });

    if (!app) {
        // Try ACCEPTED
        app = await prisma.application.findFirst({
            where: { status: 'ACCEPTED' },
            orderBy: { createdAt: 'desc' }
        });
    }

    if (!app) {
        // Last resort: any candidate
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
