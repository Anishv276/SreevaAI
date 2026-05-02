const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
    const application = await prisma.application.findUnique({
        where: { id: "app-vadla-vamsi-krishna-4514" },
        include: {
            drive: {
                include: {
                    organization: true
                }
            }
        }
    });
    console.log(JSON.stringify(application, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
