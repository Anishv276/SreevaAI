
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
            model: "gpt-4o-mini",
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
     "5-10 LPA" → min: 500000, max: 1000000, currency: "INR", period: "yearly"
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
