import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkData() {
    try {
        const appCount = await prisma.application.count();
        const driveCount = await prisma.drive.count();
        const interviewCount = await prisma.interview.count();
        
        console.log("Database Stats:");
        console.log("- Applications:", appCount);
        console.log("- Drives:", driveCount);
        console.log("- Interviews:", interviewCount);

        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentApps = await prisma.application.count({ where: { createdAt: { gte: since } } });
        console.log("- Recent Applications (7d):", recentApps);

    } catch (error) {
        console.error("Error checking data:", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkData();
