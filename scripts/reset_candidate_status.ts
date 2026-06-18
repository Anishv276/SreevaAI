/**
 * One-off script: Reset a rejected candidate's status to 'pending'
 * so they can be re-scanned with the correct threshold logic.
 * Run: npx ts-node scripts/reset_candidate_status.ts
 */
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
dotenv.config();
const prisma = new PrismaClient();
async function main() {
    // Find all candidates incorrectly rejected (has a score but status is REJECTED)
    // Adjust driveId filter if you want to target a specific drive
    const rejected = await prisma.application.findMany({
        where: { resumeStatus: "REJECTED" },
        include: { drive: { select: { title: true, screeningThreshold: true } } },
    });
    console.log(`Found ${rejected.length} rejected candidate(s):`);
    for (const app of rejected) {
        const threshold = Number(app.drive?.screeningThreshold ?? 0);
        const score = app.aiScore ?? 0;
        console.log(
            `  - ${app.fullName} | score=${score} | threshold=${threshold} | drive="${app.drive?.title}"`
        );
        if (score >= threshold) {
            // This candidate SHOULD have been shortlisted - fix it now
            await prisma.application.update({
                where: { id: app.id },
                data: {
                    resumeStatus: "SHORTLISTED",
                    interviewStatus: undefined,
                    hiringStatus: undefined,
                },
            });
            console.log(`    ✅ Fixed: REJECTED -> SHORTLISTED`);
        } else {
            console.log(`    ⏭ Skipped: score ${score} is genuinely below threshold ${threshold}`);
        }
    }
    console.log("\nDone.");
    await prisma.$disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
