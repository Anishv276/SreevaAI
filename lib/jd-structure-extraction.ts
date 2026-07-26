/**
 * lib/jd-structure-extraction.ts
 * ────────────────────────────────
 * Local (in-worker) JD text/PDF extraction that replaces the Modal endpoint.
 * Accepts: raw text (from a scraped URL or typed JD) or a raw PDF buffer.
 * Returns:  the same shape as Modal's JD extractor so the status-polling
 *           route (/api/extract/status/[jobId]) and the question-bank pipeline
 *           don't need any changes.
 *
 * Shape returned:
 *   { text: string, data: JdExtractedData, usage: ChatUsage }
 *
 * PDF → text is done locally via pdf-parse (already a dep via resume path).
 * Structured extraction is done via chatJSON (same client as Call A/B/C).
 */
import { chatJSON, LLMCallError } from "./openai-client";

const SYSTEM_PROMPT = `Convert this Job Description into structured role eligibility criteria.

CRITICAL MINDSET: A JD describes a ROLE, not just a keyword list. Extract what the person
must be ABLE TO DO and PROVE — not merely what tools they can list.

EXTRACTION RULES:

1. CRITERIA — extract 5–12 items covering ALL meaningful signals:
   - Explicit technologies ("React required", "5 years Python")
   - Responsibilities ("build REST APIs", "own the data pipeline end to end")
   - Experience requirements ("3+ years backend", "senior-level autonomy")
   - Ownership expectations ("lead technical design", "own features to production")
   - Domain context ("fintech background", "B2B SaaS experience")
   - Education/certs ONLY if explicitly required

2. CATEGORIES:
   "skill"          = specific technology or tool
   "responsibility" = something they must DO in this role
   "experience"     = years or depth in a domain
   "ownership"      = autonomy level expected
   "domain"         = industry or business context

3. PRIORITY:
   "critical" = role cannot function without (explicit hard requirement or universally table-stakes for this role title)
   "high"     = clearly required, mentioned prominently
   "medium"   = preferred or nice-to-have

4. RANK — within each priority tier, assign a rank (1 = most important):
   This replaces asking the LLM to do math. Weights are computed from rank.
   critical_rank: 1–5 (max 5 critical criteria)
   high_rank:     1–7
   medium_rank:   1–5

5. EVIDENCE REQUIRED (default "any"):
   "any"          = DEFAULT. Listing on resume is sufficient.
   "work_history" = ONLY when JD explicitly says "professional experience", "production", "commercial setting".
   "project"      = ONLY when JD explicitly says "portfolio", "open-source", "show your work".

6. TABLE STAKES: Set is_table_stakes: true for skills so fundamental to this exact role title
   that their absence would be disqualifying even if not in the JD.
   Example: Python for Data Scientist, Java for Java Backend Developer, SQL for Data Analyst.
   Maximum 2 table-stakes criteria. Leave false if uncertain.

7. SCORING HINTS:
   green_flags_to_reward: 2–4 concrete differentiators (e.g. "open-source contributor", "AWS Lambda at scale")
   red_flags_to_watch: 2–3 concrete misalignments (e.g. "only legacy stack experience", "no startup experience")

8. NO INVENTION: Never add skills not present or clearly implied by the JD.
9. NO SOFT SKILLS as criteria unless the JD provides a concrete proof signal.
10. EXPERIENCE: "2–4 years" → min_years:2, max_years:4. "5+" → min_years:5, max_years:null.

Return ONLY valid JSON. No markdown. No explanation.

{
  "job_title": string,
  "role_level": "intern"|"junior"|"mid"|"senior"|"lead"|"manager",
  "experience": {
    "min_years": number|null,
    "max_years": number|null,
    "preferred_background": string|null
  },
  "criteria": [
    {
      "id": string,
      "category": "skill"|"responsibility"|"experience"|"ownership"|"domain",
      "name": string,
      "priority": "critical"|"high"|"medium",
      "priority_rank": number,
      "evidence_required": "any"|"work_history"|"project",
      "is_table_stakes": boolean,
      "source_text": string
    }
  ],
  "scoring_hints": {
    "green_flags_to_reward": [string],
    "red_flags_to_watch": [string]
  },
  "has_technical_requirements": boolean,
  "keywords": [string]
}`;

function buildUserPrompt(text: string): string {
    return `Job Description Text:\n---\n${text.slice(0, 12000)}\n---`;
}

export type JdExtractedData = {
    job_title: string;
    role_level: string | null;
    experience: { min_years: number | null; max_years: number | null; preferred_background: string | null };
    criteria: Array<{
        id: string;
        category: string;
        name: string;
        priority: string;
        priority_rank: number;
        evidence_required: string;
        is_table_stakes: boolean;
        source_text: string;
    }>;
    scoring_hints: { green_flags_to_reward: string[]; red_flags_to_watch: string[] };
    has_technical_requirements: boolean;
    keywords: string[];
};

export type JdExtractionResult = {
    text: string;
    data: JdExtractedData;
    usage: { model: string; inputTokens: number; outputTokens: number; cachedInputTokens: number };
};

/** Extract text from a raw PDF buffer using pdf-parse. */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
    try {
        const mod = require("pdf-parse");
        const Target = mod.PDFParse || mod.default || mod;

        // Support pdf-parse v2.x (ES6 Class with .getText() method)
        if (Target && (Target.prototype?.getText || Target.name === "PDFParse" || String(Target).startsWith("class"))) {
            const parser = new Target({ data: buffer });
            try {
                const res = await parser.getText();
                return res?.text?.trim() || "";
            } finally {
                if (typeof parser.destroy === "function") {
                    await parser.destroy().catch(() => {});
                }
            }
        }

        // Support pdf-parse v1.x (function call) with fallback to constructor if needed
        try {
            const res = await Target(buffer);
            return res?.text?.trim() || "";
        } catch (e: any) {
            if (e?.message?.includes("Class constructors cannot be invoked without 'new'")) {
                const parser = new Target({ data: buffer });
                try {
                    const res = await parser.getText();
                    return res?.text?.trim() || "";
                } finally {
                    if (typeof parser.destroy === "function") {
                        await parser.destroy().catch(() => {});
                    }
                }
            }
            throw e;
        }
    } catch (err: any) {
        throw new Error(`PDF text extraction failed: ${err.message}`);
    }
}

/**
 * Run the JD structure extraction LLM call. Works on any raw text — caller
 * is responsible for converting PDF → text first via extractTextFromPdf().
 */
export async function extractJdStructure(
    rawText: string,
    model: string
): Promise<JdExtractionResult> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= 2; attempt++) {
        try {
            const result = await chatJSON({
                model,
                systemPrompt: SYSTEM_PROMPT,
                userPrompt: buildUserPrompt(rawText),
                maxTokens: 2000,
            });
            const data = result.data as JdExtractedData;
            if (!data?.job_title || !Array.isArray(data?.criteria)) {
                throw new LLMCallError("JD extraction returned malformed response (missing job_title or criteria)");
            }
            return {
                text: rawText,
                data,
                usage: {
                    model: result.model,
                    inputTokens: result.usage.inputTokens,
                    outputTokens: result.usage.outputTokens,
                    cachedInputTokens: result.usage.cachedInputTokens,
                },
            };
        } catch (err) {
            lastErr = err;
            if (attempt < 2) {
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            }
        }
    }
    throw lastErr instanceof Error ? lastErr : new LLMCallError("JD structure extraction failed after retries");
}
