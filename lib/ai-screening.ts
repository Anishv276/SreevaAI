import { prisma } from "@/lib/prisma";

// Mock AI Scoring Logic
export async function calculateCandidateScore(resumeText: string, jobDescription: string) {
    // In a real scenario, this would call OpenAI or Gemini API
    // const completion = await openai.chat.completions.create({...})

    console.log("Analyzing resume against JD...");

    // Mocking a score between 60 and 95
    const score = Math.floor(Math.random() * (95 - 60 + 1)) + 60;

    const analysis = {
        score,
        matchPercentage: `${score}%`,
        skillsFound: ["React", "Node.js", "TypeScript"],
        missingSkills: ["GraphQL"],
        flags: score < 70 ? ["Low experience in required tech stack"] : [],
        recommendation: score > 75 ? "Shortlist" : "Review Manually"
    };

    return analysis;
}

export async function processApplication(applicationId: string) {
    const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: { drive: true }
    });

    if (!application) return;

    // Simulate Resume Parsing
    const resumeText = "Mock resume text extracted from file...";

    const aiResult = await calculateCandidateScore(resumeText, application.drive.description);

    await prisma.application.update({
        where: { id: applicationId },
        data: {
            aiScore: aiResult.score,
            aiReport: JSON.stringify(aiResult),
            status: aiResult.score > application.drive.screeningThreshold ? "SCREENING_PASSED" : "APPLIED"
        }
    });

    return aiResult;
}
