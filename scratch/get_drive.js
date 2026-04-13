const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const drive = await prisma.drive.findFirst();
    if (drive) {
        console.log(`DRIVE_ID: ${drive.id}`);
    } else {
        console.log("No drives found.");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
