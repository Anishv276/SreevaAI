
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const name = "vadla vamsi krishna";
    const app = await prisma.application.findFirst({
        where: { 
            fullName: {
                contains: name,
                mode: 'insensitive'
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    if (app) {
        console.log(`FOUND_CANDIDATE_ID:${app.id}`);
        
        let interview = await prisma.interview.findUnique({
            where: { applicationId: app.id }
        });

        if (!interview) {
            console.log("Creating missing interview record...");
            interview = await prisma.interview.create({
                data: {
                    id: `int-${app.id}`,
                    applicationId: app.id,
                    status: 'PENDING'
                }
            });
        }

        console.log(`Interview Link for ${app.fullName}: http://localhost:3000/interview/${app.id}`);
    } else {
        console.log("CANDIDATE_NOT_FOUND");
        // List some recent ones just in case
        const recent = await prisma.application.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { fullName: true, id: true }
        });
        console.log("Recent candidates:", recent);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
