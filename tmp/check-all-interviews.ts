import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function count() {
    const total = await prisma.interview.count();
    console.log("Total Interview Records:", total);
    
    const all = await prisma.interview.findMany({
        take: 5,
        orderBy: { updatedAt: 'desc' }
    });
    console.log("Latest 5 Interviews:", JSON.stringify(all, null, 2));
}

count().finally(() => prisma.$disconnect());
