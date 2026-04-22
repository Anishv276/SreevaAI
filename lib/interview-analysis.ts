import OpenAI from "openai";

/**
 * Generates a comprehensive interview analysis report using OpenAI.
 * This function takes the interview transcript, candidate details, and job requirements
 * to produce a structured analysis of the candidate's performance.
 */
export async function generateInterviewReport(params: {
  transcript: string;
  resumeText: string;
  jdText: string;
  role: string;
  candidateName: string;
  durationSeconds: number;
  proctoringEvents: any[];
  orgId?: string;
}) {
  const {
    transcript,
    resumeText,
    jdText,
    role,
    candidateName,
    durationSeconds,
    proctoringEvents,
  } = params;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "dummy-key-for-mock-mode") {
    console.warn("[INTERVIEW_ANALYSIS] OPENAI_API_KEY is missing or dummy. Using fallback report.");
    return generateFallbackReport(candidateName, role);
  }

  const openai = new OpenAI({ apiKey });

  const prompt = `
You are a senior technical recruiter and behavioral analyst. 
You are analyzing a transcript of an AI-led interview.

CANDIDATE: ${candidateName}
ROLE: ${role}
DURATION: ${Math.round(durationSeconds / 60)} minutes
PROCTORING EVENTS: ${JSON.stringify(proctoringEvents || [])}

[RESUME TEXT]
${resumeText || "No resume provided."}

[JOB DESCRIPTION]
${jdText || "No JD provided."}

[INTERVIEW TRANSCRIPT]
${transcript}

---
TASK:
Analyze the transcript and generate a structured JSON report. 
Your analysis must be objective, deep, and focus on both technical skills and behavioral signals.

OUTPUT SCHEMA (JSON):
{
  "qa_blocks": [
    {
      "q": number,
      "title": "string (Short question summary)",
      "tags": ["string"],
      "score": "X/10",
      "scoreColor": "text-orange-500",
      "verdict": "detailed reasoning for this specific answer",
      "confidence": "High" | "Medium" | "Low"
    }
  ],
  "recording": {
    "summary": "1-2 sentence summary of the interview audio/video performance"
  },
  "verdict": {
    "summary": "Detailed overall summary of the candidate's performance (200-300 words)",
    "recommendation": "Strong Yes" | "Yes" | "Maybe" | "No",
    "recommendation_reason": "Primary reason for this recommendation"
  },
  "strategic_verdict": {
    "decision": "Hire" | "Maybe" | "Do Not Hire",
    "summary": "Strategic overview for leadership",
    "rationale": ["point 1", "point 2"],
    "next_actions": ["action 1"]
  },
  "integrity": {
    "score": number (0-100),
    "summary": "Summary of proctoring and behavioral integrity"
  },
  "skills_proof": [
    {
      "skill": "string",
      "status": "PROVED" | "PARTIAL" | "NOT PROVED" | "NOT TESTED",
      "score": "string (X/10)",
      "evidence": "string"
    }
  ]
}

Guidelines:
1. qa_blocks: Map each question-answer pair from the transcript. If the transcript is unstructured, group it into logical segments.
2. Recommendation: Use "Strong Yes" only for exceptional candidates. Use "No" for clear failures.
3. Integrity: Factor in proctoring events (tab switching, face detection issues).
4. Logic: Ensure the rationale directly cites evidence from the transcript.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a professional recruitment AI. Output ONLY valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("Empty response from OpenAI");

    const data = JSON.parse(content);
    console.log(`[INTERVIEW_ANALYSIS] Successfully generated report for ${candidateName}`);
    return data;
  } catch (error: any) {
    console.error("[INTERVIEW_ANALYSIS_FATAL]:", error.message);
    return generateFallbackReport(candidateName, role, "AI analysis encountered an error.");
  }
}

/**
 * Returns a minimal valid report structure if the AI analysis fails.
 */
function generateFallbackReport(name: string, role: string, reason = "Internal processing error.") {
  return {
    qa_blocks: [],
    recording: { summary: "Transcript captured successfully." },
    verdict: { 
      summary: `Basic analysis for ${name} for ${role}. ${reason}`, 
      recommendation: "Maybe", 
      recommendation_reason: "Manual review required due to processing failure." 
    },
    strategic_verdict: { 
      decision: "Maybe", 
      summary: "Requires manual oversight.", 
      rationale: ["Automated analysis failed"], 
      next_actions: ["Review transcript manually"] 
    },
    integrity: { score: 100, summary: "No automated integrity flags." },
    skills_proof: []
  };
}
