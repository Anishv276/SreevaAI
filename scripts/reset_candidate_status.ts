/**
 * One-off script: Reset a rejected candidate's status to 'pending'
 * so they can be re-scanned with the correct threshold logic.
 * Run: npx tsx scripts/reset_candidate_status.ts
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
    const rejected = await prisma.application.findMany({
        where: { resumeScreeningStatus: "REJECTED" },
        include: { job: { select: { title: true, resumeScreeningThreshold: true } } },
    });

    console.log(`Found ${rejected.length} rejected candidate(s):`);

    for (const app of rejected) {
        const threshold = Number(app.job?.resumeScreeningThreshold ?? 0);
        const score = app.resumeAiScore ?? 0;
        console.log(
            `  - ${app.candidateFullName} | score=${score} | threshold=${threshold} | job="${app.job?.title}"`
        );
        if (score >= threshold) {
            await prisma.application.update({
                where: { id: app.id },
                data: { resumeScreeningStatus: "SHORTLISTED" },
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
