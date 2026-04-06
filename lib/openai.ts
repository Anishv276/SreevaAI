
import OpenAI from "openai";

// Initialize OpenAI client
// Ensure OPENAI_API_KEY is set in .env
const apiKey = process.env.OPENAI_API_KEY || "dummy-key-for-mock-mode";
const openai = new OpenAI({
    apiKey: apiKey,
});

export async function transcribeInterviewAudio(file: File) {
    if (!process.env.OPENAI_API_KEY) {
        return "Transcription unavailable in mock mode.";
    }

    const transcription = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
    });

    return transcription.text || "";
}



export async function calculateScore(resumeText: string, jdText: string) {
    const prompt = `
        Job Description:
        ${jdText}

        Candidate Resume:
        ${resumeText}

        Task:
        Analyze the candidate's resume against the Job Description.
        
        Return a JSON object with:
        - score (number, 0-100)
        - reasoning (string, 1-2 sentences why this score)
        - status (string, "Shortlisted" | "Rejected" | "Borderline")
        - skillsFound (array of strings, key technical skills from JD found in resume)
        - missingSkills (array of strings, key technical skills from JD MISSING in resume)
        - flags (array of strings, any red flags like "Too little experience", "Job hopping", "Misaligned location")
        - recommendation (string, "Shortlist" | "Reject" | "Interview" | "Under Review")
    `;

    try {
        if (!process.env.OPENAI_API_KEY) {
            console.warn("OPENAI_API_KEY not found. Returning mock results.");
            return { 
                score: 85, 
                status: "Shortlisted", 
                reasoning: "Mock Mode: Strong candidate match.",
                skillsFound: ["React", "TypeScript", "Node.js"],
                missingSkills: [],
                flags: [],
                recommendation: "Shortlist"
            };
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a professional hiring manager AI. Be precise and objective. Return ONLY valid JSON." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        return content ? JSON.parse(content) : { score: 0, status: "Rejected", reasoning: "Analysis failed", skillsFound: [], missingSkills: [], flags: ["Extraction Failed"], recommendation: "Reject" };
    } catch (error) {
        console.error("OpenAI Scoring Error:", error);
        return { 
            score: 0, 
            status: "Error", 
            reasoning: "AI Analysis Failed",
            skillsFound: [],
            missingSkills: [],
            flags: ["AI Service Unavailable"],
            recommendation: "Manual Review"
        };
    }
}

export async function extractJDFromText(text: string) {
    const prompt = `Extract structured data from the Job Description below.

Return JSON in this exact schema:

{
  "job_title": string,
  "company_name": string | null,
  "department": string | null,
  "location": {
    "city": string | null,
    "state": string | null,
    "country": string | null,
    "remote": boolean
  },
  "employment_type": "full-time" | "part-time" | "contract" | "internship" | null,
  "experience": {
    "min_years": number | null,
    "max_years": number | null
  },
  "skills": {
    "must_have": [string],
    "good_to_have": [string],
    "soft_skills": [string]
  },
  "education": {
    "required": string | null,
    "preferred": string | null
  },
  "responsibilities": [string],
  "requirements": [string],
  "salary": {
    "min": number | null,
    "max": number | null,
    "currency": string | null,
    "period": "yearly" | "monthly" | null
  },
  "keywords": [string],
  "summary": string
}

Extraction Rules:
- Convert experience into numbers (e.g., "2-4 years" → 2 and 4). If fresher, use 0.
- Classify skills strictly:
  must_have = Technical tools, frameworks, and hard skills (e.g., React, n8n, Zapier).
  good_to_have = Nice-to-have technical tools or industry knowledge.
  soft_skills = Communication, leadership, teamwork, etc.
- NEVER put technical tools in soft_skills.
- Normalize skills (e.g., "experience in React.js" → "React.js").
- Convert salary like "5-10 LPA" into numeric values (500000 to 1000000).
- Set remote = true if remote or hybrid is mentioned.
- Extract responsibilities as complete, detailed bullet points. DO NOT summarize or omit specific tools, technologies, or frameworks mentioned (e.g., names like "Terraform", "AWS", "Kubernetes", "Prometheus" must be preserved).
- Extract 10-15 relevant keywords for resume matching.
- Write a 1–2 line clear summary of the role.

Job Description:
${text}
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are structured data extraction engine for hiring systems. Convert JDs into clean, consistent JSON. Output ONLY valid JSON. Follow the schema exactly. Do not add extra fields. Standardize all values. Remove duplicates." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        return content ? JSON.parse(content) : null;
    } catch (error) {
        console.error("OpenAI JD Extraction Error:", error);
        return null;
    }
}
