import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    console.log("--- Checking Database State ---");
    try {
        const appCount = await prisma.application.count();
        console.log(`Applications: ${appCount}`);
        if (appCount > 0) {
            const latestApp = await prisma.application.findFirst({
                orderBy: { createdAt: 'desc' },
                select: { id: true, email: true }
            });
            console.log("Latest Application:", latestApp);
            const interview = await prisma.interview.findUnique({
                where: { applicationId: latestApp?.id }
            });
            console.log("Interview record:", interview ? {
                status: interview.status,
                expiresAt: interview.expiresAt,
                accessToken: interview.accessToken,
                applicationId: interview.applicationId
            } : "Missing");
        } else {
            console.log("WARNING: NO APPLICATIONS FOUND IN DATABASE.");
        }
    } catch (err) {
        console.error("Database check failed:", err);
    } finally {
        await prisma.$disconnect();
    }
}
main();
