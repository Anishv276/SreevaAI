const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
    const ticket = await prisma.supportTicket.findFirst({
        include: {
            interview: {
                include: {
                    application: {
                        include: {
                            drive: {
                                include: {
                                    organization: true
                                }
                            }
                        }
                    }
                }
            }
        }
    });
    console.log(JSON.stringify(ticket, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
