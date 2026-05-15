import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const drive = await prisma.drive.findUnique({
        where: { id: 'drv-operations-associate-cgm-1004' }
    });
    
    console.log("Drive ID:", drive?.id);
    console.log("Drive Title:", drive?.title);
    if (drive?.extractedDetails) {
        const jd = JSON.parse(drive.extractedDetails as string);
        console.log("Extracted Details Keys:", Object.keys(jd));
        console.log("Criteria Count:", jd.criteria?.length);
        console.log("Skills:", jd.skills);
    } else {
        console.log("NO extractedDetails");
    }
}

main().finally(() => prisma.$disconnect());
