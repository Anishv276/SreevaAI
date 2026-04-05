import { prisma } from "@/lib/prisma";
import { calculateScore as realAIScore } from "@/lib/openai";

// Real AI Scoring Logic
export async function calculateCandidateScore(resumeText: string, jobDescription: string) {
    if (!resumeText || resumeText === "Mock resume text...") {
        return {
            score: 0,
            status: "REJECTED",
            reasoning: "Resume content missing or invalid.",
            skillsFound: [],
            missingSkills: [],
            flags: ["No resume text available"],
            recommendation: "Reject"
        };
    }

    const aiResult = await realAIScore(resumeText, jobDescription);
    
    return {
        ...aiResult,
        matchPercentage: `${aiResult.score}%`,
    };
}

export async function processApplication(applicationId: string) {
    const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: { drive: true }
    });

    if (!application) return;

    // Use actual candidate resume text
    const resumeText = application.resumeText || "";

    const aiResult = await calculateCandidateScore(resumeText, application.drive.description);

    await prisma.application.update({
        where: { id: applicationId },
        data: {
            aiScore: aiResult.score,
            aiReport: JSON.stringify(aiResult),
            status: aiResult.score >= (application.drive.screeningThreshold || 60) ? "Shortlisted" : "Rejected"
        }
    });

    return aiResult;
}
