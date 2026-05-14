import OpenAI from "openai";

// Lazy-initialized OpenAI client to prevent module import errors when API key is missing.
let _openai: OpenAI | null = null;

/**
 * Returns the initialized OpenAI client.
 * Throws a critical error ONLY when called and the key is missing,
 * preventing Next.js from failing at startup/build time.
 */
export function getOpenAIClient(): OpenAI {
    if (_openai) return _openai;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "dummy-key-for-mock-mode") {
        throw new Error("CRITICAL_CONFIGURATION_ERROR: OPENAI_API_KEY is missing from environment variables. Please set a valid key in .env to use AI features.");
    }

    _openai = new OpenAI({
        apiKey: apiKey,
    });

    return _openai;
}

// Transcription logic removed as it is now handled by LiveKit / Deepgram in the candidate agent.

/**
 * Generate a vector embedding for a piece of text using OpenAI.
 * Uses text-embedding-3-small by default (1536 dimensions).
 */
export async function getEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
        throw new Error("Text is required for embedding generation");
    }
    
    // Clean text: remove newlines and extra spaces
    const cleanText = text.replace(/\n/g, " ").trim();
    
    try {
        const openai = getOpenAIClient();
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: cleanText,
        });
        
        return response.data[0].embedding;
    } catch (error: any) {
        console.error("[OPENAI_EMBEDDING_ERROR]:", error.message);
        throw error;
    }
}

import { z } from "zod";

// JD Extraction Schema
const JDSchema = z.object({
    job_title: z.string().default("Unknown Position"),
    department: z.string().nullable().default(null),
    work_type: z.enum(["Remote", "Hybrid", "On-site"]).default("On-site"),
    employment_type: z.enum(["Full-time", "Part-time", "Contract", "Internship", "Freelance"]).nullable().default(null),
    role_summary: z.string().default(""),
    responsibilities: z.array(z.string()).default([]),
    requirements: z.array(z.string()).default([]),
    salary: z.object({
        min: z.number().nullable().default(null),
        max: z.number().nullable().default(null),
        currency: z.string().nullable().default(null),
        period: z.enum(["yearly", "monthly"]).nullable().default(null),
    }).default({ min: null, max: null, currency: null, period: null }),
    skills: z.object({
        must_have: z.array(z.object({
            skill: z.string(),
            weight: z.enum(["critical", "high", "medium"]),
        })).default([]),
        good_to_have: z.array(z.string()).default([]),
    }).default({ must_have: [], good_to_have: [] }),
    experience: z.object({
        min_years: z.number().nullable().default(null),
        max_years: z.number().nullable().default(null),
        preferred_background: z.string().nullable().default(null),
    }).default({ min_years: null, max_years: null, preferred_background: null }),
    role_context: z.object({
        seniority: z.enum(["intern", "junior", "mid", "senior", "lead", "manager"]).nullable().default(null),
    }).default({ seniority: null }),
    education: z.object({
        required: z.string().nullable().default(null),
        preferred: z.string().nullable().default(null),
    }).default({ required: null, preferred: null }),
    scoring_hints: z.object({
        green_flags_to_reward: z.array(z.string()).default([]),
        red_flags_to_watch: z.array(z.string()).default([]),
    }).default({ green_flags_to_reward: [], red_flags_to_watch: [] }),
    interview_questions: z.array(z.object({
        question: z.string(),
        intent: z.string(),
        skill_tested: z.string(),
    })).default([]),
    has_technical_requirements: z.boolean().default(true),
    keywords: z.array(z.string()).default([]),
});

type JDData = z.infer<typeof JDSchema>;

const JDSkeleton: JDData = {
    job_title: "Unknown Position",
    department: null,
    work_type: "On-site",
    employment_type: null,
    role_summary: "",
    responsibilities: [],
    requirements: [],
    salary: { min: null, max: null, currency: null, period: null },
    skills: { must_have: [], good_to_have: [] },
    experience: { min_years: null, max_years: null, preferred_background: null },
    role_context: { seniority: null },
    education: { required: null, preferred: null },
    scoring_hints: { green_flags_to_reward: [], red_flags_to_watch: [] },
    interview_questions: [],
    has_technical_requirements: true,
    keywords: [],
};

function shouldKeepInterviewQuestions(text: string): boolean {
    const normalized = text.toLowerCase();
    return /predefined interview questions|interview questions|sample interview questions|screening questions|question bank|question set/.test(normalized);
}

// calculateScore is handled by the Python worker scripts/extract_pdf.py for production consistency.

export async function extractJDFromText(text: string, modelOverride?: string): Promise<{
    data: JDData;
    usage: {
        model: string;
        inputTokens: number;
        outputTokens: number;
        cachedInputTokens: number;
    };
}> {
    const model = modelOverride || "gpt-5.4-mini";
    const prompt = `Extract a complete, form-ready JSON object from this Job Description.
Output is used to auto-fill a hiring drive form AND feed a resume scoring engine. No hallucination.

RULES:
1. SKILLS: must_have = explicitly required/essential only. good_to_have = preferred/bonus (flat strings).
   Soft skills (communication, teamwork, leadership) -> NEVER in must_have/good_to_have.
   weight: "critical" = core to role or mentioned 2+ times | "high" = clearly required | "medium" = minor.
   Canonical: React.js/ReactJS -> "React" | Node.js/NodeJS -> "Node.js" | PostgreSQL/Postgres -> "PostgreSQL" | AWS -> "AWS" | JavaScript/JS -> "JavaScript" | TypeScript/TS -> "TypeScript" | GCP -> "GCP" | Azure -> "Azure" | n8n/N8N -> "n8n".

2. EXPERIENCE: Numbers only. "2-4 years" -> min:2,max:4 | "5+ years" -> min:5,max:null | fresher -> min:0,max:1 | not mentioned -> null.

3. SALARY: Convert to annual base in local currency. "10-12 LPA INR" -> min:1000000,max:1200000,currency:"INR",period:"yearly". Not mentioned -> all null.

4. RESPONSIBILITIES: Extract as flat array of strings. Each item = one responsibility bullet.

5. REQUIREMENTS: Extract as flat array of qualification strings (degrees, certs, years of exp, hard prereqs).

6. role_summary: 2-3 sentence overview of what the role does. Use JD text, do not invent.

7. work_type: "Remote"|"Hybrid"|"On-site" — only if explicitly stated, else "On-site".

8. employment_type: only if explicitly stated, else null.

9. INTERVIEW QUESTIONS: Only generate interview_questions if the JD explicitly includes or requests predefined interview/sample interview questions.
   If the JD simply describes the role and does NOT ask for questions, return [].
   Do NOT invent interview questions from the role alone.

10. No data in JD -> null or []. Never invent.

Return ONLY valid JSON. No markdown, no explanation.

{
  "job_title": "string",
  "department": "string | null",
  "work_type": "Remote" | "Hybrid" | "On-site",
  "employment_type": "Full-time" | "Part-time" | "Contract" | "Internship" | "Freelance" | null,
  "role_summary": "string",
  "responsibilities": ["string"],
  "requirements": ["string"],
  "salary": {"min": number | null, "max": number | null, "currency": "string | null", "period": "yearly" | "monthly" | null},
  "skills": {
    "must_have": [{"skill": "string", "weight": "critical" | "high" | "medium"}],
    "good_to_have": ["string"]
  },
  "experience": {"min_years": number | null, "max_years": number | null, "preferred_background": "string | null"},
  "role_context": {"seniority": "intern" | "junior" | "mid" | "senior" | "lead" | "manager" | null},
  "education": {"required": "string | null", "preferred": "string | null"},
  "scoring_hints": {"green_flags_to_reward": ["string"], "red_flags_to_watch": ["string"]},
  "interview_questions": [{"question": "string", "intent": "string", "skill_tested": "string"}],
  "has_technical_requirements": boolean,
  "keywords": ["string"]
}

Job Description:
${text}
`;

    try {
        console.log("[AI_JD_EXTRACT_START]: Text length:", text.length);
        const openai = getOpenAIClient();
        const completion = await openai.chat.completions.create({
            model,
            messages: [
                { role: "system", content: "You are structured data extraction engine for hiring systems. Convert JDs into clean, consistent JSON. Output ONLY valid JSON. Follow the schema exactly. Do not add extra fields. Standardize all values. Remove duplicates." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        if (!content) {
            console.error("[AI_JD_EXTRACT_NULL]: No content received");
            return {
                data: JDSkeleton,
                usage: {
                    model,
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedInputTokens: 0,
                },
            };
        }

        const rawData = JSON.parse(content);
        const validated = JDSchema.safeParse(rawData);

        if (!validated.success) {
            console.error("[AI_JD_VALIDATION_ERROR]:", validated.error.format());
            // Merge valid parts with skeleton if possible, but for now just return skeleton to be safe
            return {
                data: { ...JDSkeleton, ...rawData } as JDData,
                usage: {
                    model,
                    inputTokens: completion.usage?.prompt_tokens ?? 0,
                    outputTokens: completion.usage?.completion_tokens ?? 0,
                    cachedInputTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
                },
            };
        }

        const normalizedData: JDData = {
            ...validated.data,
            interview_questions: shouldKeepInterviewQuestions(text)
                ? validated.data.interview_questions
                : [],
        };

        console.log("[AI_JD_EXTRACT_SUCCESS]: Extraction complete for", validated.data.job_title);
        return {
            data: normalizedData,
            usage: {
                model,
                inputTokens: completion.usage?.prompt_tokens ?? 0,
                outputTokens: completion.usage?.completion_tokens ?? 0,
                cachedInputTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
            },
        };
    } catch (error: any) {
        console.error("[AI_JD_EXTRACT_FATAL]:", error.message);
        return {
            data: JDSkeleton,
            usage: {
                model,
                inputTokens: 0,
                outputTokens: 0,
                cachedInputTokens: 0,
            },
        };
    }
}
