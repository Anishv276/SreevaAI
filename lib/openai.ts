
import OpenAI from "openai";

// Initialize OpenAI client
// Ensure OPENAI_API_KEY is set in .env
const apiKey = process.env.OPENAI_API_KEY || "dummy-key-for-mock-mode";
const openai = new OpenAI({
    apiKey: apiKey,
});

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
    job_title: z.string().default("Unknown Role"),
    company_name: z.string().nullable().default(null),
    department: z.string().nullable().default(null),
    work_type: z.enum(["Remote", "Hybrid", "On-site"]).default("On-site"),
    employment_type: z.enum(["Full-time", "Part-time", "Contract", "Internship", "Freelance"]).nullable().default(null),
    location: z.object({
        city: z.string().nullable(),
        state: z.string().nullable(),
        country: z.string().nullable(),
        remote: z.boolean(),
        hybrid: z.boolean(),
        location_confidence: z.enum(["stated", "inferred", "unknown"]),
    }).default({
        city: null,
        state: null,
        country: null,
        remote: false,
        hybrid: false,
        location_confidence: "unknown"
    }),
    experience: z.object({
        min_years: z.number().nullable(),
        max_years: z.number().nullable(),
        preferred_background: z.string().default(""),
    }).default({ min_years: null, max_years: null, preferred_background: "" }),
    skills: z.object({
        must_have: z.array(z.object({
            skill: z.string(),
            why_needed: z.string(),
            weight: z.enum(["critical", "high", "medium"])
        })).default([]),
        good_to_have: z.array(z.object({
            skill: z.string(),
            context: z.string()
        })).default([]),
        soft_skills: z.array(z.string()).default([]),
    }).default({ must_have: [], good_to_have: [], soft_skills: [] }),
    salary: z.object({
        min: z.number().nullable(),
        max: z.number().nullable(),
        currency: z.string().nullable(),
        period: z.enum(["yearly", "monthly"]).nullable(),
        disclosed: z.boolean(),
    }).optional().default({ min: null, max: null, currency: null, period: null, disclosed: false }),
    role_summary: z.string().default(""),
    has_technical_requirements: z.boolean().default(true),
    keywords: z.array(z.string()).default([]),
});

type JDData = z.infer<typeof JDSchema>;

// Skeleton fallback for JD
const JDSkeleton: JDData = {
    job_title: "Manual Review Required",
    company_name: null,
    department: null,
    work_type: "On-site",
    employment_type: null,
    location: { city: null, state: null, country: null, remote: false, hybrid: false, location_confidence: "unknown" },
    experience: { min_years: null, max_years: null, preferred_background: "See original text" },
    skills: { must_have: [], good_to_have: [], soft_skills: [] },
    salary: { min: null, max: null, currency: null, period: null, disclosed: false },
    role_summary: "AI extraction failed or text was too complex. Please review manually.",
    has_technical_requirements: true,
    keywords: []
};

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
    const model = modelOverride || "gpt-4o";
    const prompt = `You are a senior technical recruiter and structured data engineer.
Your job is to extract a precise, bias-free, machine-readable JSON object from a Job Description.
This output is consumed by an automated scoring engine that matches hundreds of resumes.
Every field you produce directly affects hiring decisions — accuracy and fairness are non-negotiable.

════════════════════════════════════════════════
BEFORE YOU EXTRACT — MANDATORY PRE-CHECKS
════════════════════════════════════════════════

1. SOFT SKILLS NEVER GO IN must_have OR good_to_have
   Communication, problem-solving, teamwork, leadership, ownership, willingness to learn —
   these are NEVER technical skills. They belong ONLY in soft_skills.
   If a JD has no real technical must-haves → must_have = []
   A scoring engine will try to match must_have against resumes. Soft skills WILL break scoring.

2. GENDER AND BIAS NEUTRALITY
   Strip all gendered language from extracted text:
     "he/she" → "the candidate"
     "guys", "rockstar", "ninja", "guru", "hustler" → remove or neutralize
     "recent graduate" with age implication → keep as "entry-level"
   Never infer or state gender. Never use language that implies cultural fit bias.

3. LOCATION — NEVER ASSUME
   If no city/state/country is mentioned → all location fields = null
   Do NOT infer location from company name, language, or currency.
   If remote=true is stated → work_type = "Remote", hybrid = false
   If hybrid is stated → work_type = "Hybrid", remote = false
   If neither is stated → work_type = "On-site", but remote=false, hybrid=false, city/state/country = null
   NEVER set work_type = "On-site" and leave all location fields null without flagging it.

4. EXPERIENCE — NUMBERS ONLY
   Convert all text ranges to numbers: "2-4 years" → min_years: 2, max_years: 4
   Fresher/entry-level/0 experience → min_years: 0, max_years: 1
   "5+ years" → min_years: 5, max_years: null
   If no experience mentioned → min_years: null, max_years: null
   NEVER guess experience from seniority title alone.

5. SKILL NORMALIZATION — CONSISTENT NAMES
   Always use the canonical form:
     React.js / ReactJS / React JS → "React"
     Node.js / NodeJS → "Node.js"
     Postgres / PostgreSQL / postgres → "PostgreSQL"
     AWS / Amazon Web Services → "AWS"
     GCP / Google Cloud / Google Cloud Platform → "GCP"
     MS Azure / Microsoft Azure → "Azure"
     JS / Javascript / javascript → "JavaScript"
     TS / Typescript → "TypeScript"
     ML / Machine Learning → "Machine Learning"
     AI tools / artificial intelligence tools → "AI Tools"
     n8n / N8N → "n8n"
   When in doubt: use the official product name exactly as the vendor writes it.

6. MUST-HAVE vs GOOD-TO-HAVE — STRICT CLASSIFICATION
   must_have: ONLY skills the JD marks as required, mandatory, must have, essential.
     weight = "critical" if mentioned 2+ times OR the role cannot function without it
     weight = "high" if clearly required, mentioned once
     weight = "medium" if required but a minor part of the role
   good_to_have: ONLY skills listed as preferred, bonus, nice-to-have, plus, or advantageous.
   If a skill is ambiguous → classify as good_to_have, never must_have.
   If must_have ends up empty because the JD has no real technical requirements → that is correct.

7. SALARY STANDARDIZATION
   Always convert to annual base numbers in the local currency:
     "5-10 LPA INR" → min: 500000, max: 1000000, currency: "INR", period: "yearly"
     "50-70k USD" → min: 50000, max: 70000, currency: "USD", period: "yearly"
     "₹30,000/month" → min: 360000, max: null, currency: "INR", period: "yearly"
   If salary not mentioned → min: null, max: null, currency: null, period: null, disclosed: false

8. DEAL BREAKERS — ONLY IF EXPLICIT
   Only extract if the JD explicitly states a hard disqualifier.
   Examples of valid deal breakers: "must be based in X city", "only Indian nationals", "no freshers"
   DO NOT invent deal breakers from soft language like "preferred" or "ideally".

9. RESPONSIBILITIES — PRESERVE EXACT TOOL NAMES
   In responsibilities_flat, copy tool/tech names exactly as they appear in the JD.
   In responsibilities (rich), extract skills_involved only from skills actually used in that task.
   seniority_signal: Does this task imply junior / mid / senior level work?
     junior = guided task, learning on the job
     mid = independent execution, some ownership
     senior = owns outcomes, makes decisions, influences architecture

10. DO NOT HALLUCINATE
    If a field has no data in the JD → null or []
    Never infer company name from email domains, logos, or context clues.
    Never fill in location from assumed country based on language or currency.

11. REQUIREMENTS vs SKILLS
    The 'requirements' field MUST be a flat list of actual qualifications or prerequisites.
    Include specific years of experience, degree requirements, certifications (e.g., AWS Certified), 
    and hard tech requirements that aren't just single-word skills.
    Example: ["Bachelor's degree in Computer Science", "AWS Solutions Architect certificate", "5+ years experience in high-traffic Python apps"]
    DO NOT leave 'requirements' empty if the JD mentions qualifications.

════════════════════════════════════════════════
OUTPUT SCHEMA
════════════════════════════════════════════════

Return ONLY valid JSON matching this schema exactly. No markdown. No explanation. No extra keys.

{
  "job_title": "string",
  "company_name": "string | null",
  "department": "string | null",

  "work_type": "Remote" | "Hybrid" | "On-site",
  "employment_type": "Full-time" | "Part-time" | "Contract" | "Internship" | "Freelance" | null,

  "location": {
    "city": "string | null",
    "state": "string | null",
    "country": "string | null",
    "remote": boolean,
    "hybrid": boolean,
    "location_confidence": "stated" | "inferred" | "unknown"
  },

  "role_context": {
    "seniority": "intern" | "junior" | "mid" | "senior" | "lead" | "manager" | null,
    "team_size_hint": "string | null",
    "work_style": "startup" | "enterprise" | "agency" | "unknown",
    "ic_or_manager": "ic" | "manager" | "both" | "unknown",
    "pace": "fast-paced" | "structured" | "unknown"
  },

  "experience": {
    "min_years": number | null,
    "max_years": number | null,
    "preferred_background": "string"
  },

  "skills": {
    "must_have": [
      {
        "skill": "string",
        "why_needed": "string",
        "weight": "critical" | "high" | "medium"
      }
    ],

    "good_to_have": [
      {
        "skill": "string",
        "context": "string"
      }
    ],

    "soft_skills": ["string"]
  },

  "education": {
    "required": "string | null",
    "preferred": "string | null"
  },

  "responsibilities_flat": ["string"],

  "responsibilities": [
    {
      "task": "string",
      "skills_involved": ["string"],
      "seniority_signal": "junior" | "mid" | "senior" | null
    }
  ],

  "requirements": ["string"],

  "deal_breakers": [
    {
      "condition": "string",
      "reason": "string"
    }
  ],

  "interview_signals": [
    {
      "area": "string",
      "what_to_probe": "string",
      "why_it_matters": "string"
    }
  ],

  "salary": {
    "min": number | null,
    "max": number | null,
    "currency": "string | null",
    "period": "yearly" | "monthly" | null,
    "disclosed": boolean
  },

  "scoring_hints": {
    "prioritize": "string",
    "red_flags_to_watch": ["string"],
    "green_flags_to_reward": ["string"]
  },

  "role_summary": "string",
  "has_technical_requirements": boolean,
  "keywords": ["string"]
}

════════════════════════════════════════════════
Job Description:
${text}
`;

    try {
        console.log("[AI_JD_EXTRACT_START]: Text length:", text.length);
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

        console.log("[AI_JD_EXTRACT_SUCCESS]: Extraction complete for", validated.data.job_title);
        return {
            data: validated.data,
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
