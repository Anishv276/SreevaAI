import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    console.log("--- Checking Database State ---");
    try {
        const appCount = await prisma.application.count();
        console.log(`Applications: ${appCount}`);
        if (appCount > 0) {
            const latestApp = await prisma.application.findFirst({
                orderBy: { appliedAt: 'desc' },
                select: { id: true, candidateEmail: true }
            });
            console.log("Latest Application:", latestApp);
            const interview = await prisma.interview.findUnique({
                where: { applicationId: latestApp?.id }
            });
            console.log("Interview record:", interview ? {
                interviewStatus: interview.interviewStatus,
                inviteLinkExpiresAt: interview.inviteLinkExpiresAt,
                candidateInviteToken: interview.candidateInviteToken,
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
