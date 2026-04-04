import { PrismaClient } from "@prisma/client";
import { gradeAssessment } from "../lib/ai-grader";

const prisma = new PrismaClient();

async function main() {
    console.log("Finding latest completed assessment...");
    const assessment = await prisma.assessment.findFirst({
        orderBy: { completedAt: 'desc' },
        where: { completedAt: { not: null } },
        include: {
            questions: { orderBy: { order: "asc" } },
            responses: true,
            application: {
                include: {
                    drive: { select: { description: true } }
                }
            }
        }
    });

    if (!assessment) {
        console.error("No completed assessment found.");
        return;
    }

    console.log(`Grading assessment ${assessment.id} for ${assessment.application?.fullName || "Candidate"}...`);

    const qaInputs = assessment.questions.map((q: any) => {
        const response = assessment.responses.find((r: any) => r.questionId === q.id);
        return {
            text: q.text,
            type: q.type,
            correctAnswer: q.correctAnswer || undefined,
            options: q.options ? JSON.parse(q.options) : undefined,
            answer: response?.answer || "",
        };
    });

    const jdText = assessment.application?.drive?.description || "";
    
    const report = await gradeAssessment({
        questions: qaInputs,
        startedAt: assessment.startedAt,
        completedAt: assessment.completedAt,
        jdText
    });

    await prisma.assessment.update({
        where: { id: assessment.id },
        data: { aiReport: JSON.stringify(report) }
    });

    console.log("Grading complete!");
    console.log(`New Score: ${report.overallScore}`);
    console.log(`Recommendation: ${report.recommendationStatus}`);
    console.log(`Breakdown Count: ${report.questionBreakdown.length}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
