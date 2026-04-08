import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function count() {
    const totalApp = await prisma.application.count();
    console.log("Total Application Records:", totalApp);
    
    const latest = await prisma.application.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { id: true, fullName: true, status: true }
    });
    console.log("Latest Application:", JSON.stringify(latest, null, 2));
}

count().finally(() => prisma.$disconnect());
