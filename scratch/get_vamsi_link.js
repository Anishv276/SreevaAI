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
        console.log(`Interview Link for ${app.fullName}: https://sreevaai.com/interview/${app.id}`);
    } else {
        console.log(`Candidate "${name}" not found.`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
