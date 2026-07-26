import { randomUUID } from "crypto";
import { chatJSON, LLMCallError, type ChatJSONResult } from "@/lib/openai-client";
import type { BankQuestion, BankQuestionType } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type JdExtractedDetails = {
    job_title?: string | null;
    role_level?: string | null;
    experience?: {
        min_years?: number | null;
        max_years?: number | null;
        preferred_background?: string | null;
    } | null;
    criteria?: Array<{
        name: string;
        category: string;
        priority: string;
        source_text?: string | null;
    }> | null;
    keywords?: string[] | null;
    scoring_hints?: {
        green_flags_to_reward?: string[] | null;
    } | null;
};

export type ValidatedQuestionBank = {
    questions: BankQuestion[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_QUESTIONS = 12;
const MAX_RETRIES = 2;

const LEVEL_LABELS: Record<number, string> = {
    1: "Easy",
    2: "Moderate",
    3: "Difficult",
    4: "Extreme",
};

const DIFFICULTY_DEFINITION = `Difficulty levels — follow exactly:
  Level 1 (Easy): Definitional/recall. Tests basic familiarity.
  Level 2 (Moderate): Applied understanding. Tests practical, hands-on grasp.
  Level 3 (Difficult): Scenario and trade-off based reasoning. Requires genuine depth.
  Level 4 (Extreme): Deep expert-level reasoning, ambiguous/edge-case scenarios. Senior/expert only.`;

const SNIPPET_DIFFICULTY_RUBRIC = `Snippet difficulty rubric (same level applies to snippet questions as all others):
  Level 1: Obvious, directly-traceable output. No tricks.
  Level 2: Requires tracing execution/query logic step by step — no hidden subtleties.
  Level 3: Contains a genuine subtlety (a real bug, scoping quirk, a join that silently drops rows) requiring real reasoning.
  Level 4: A classic "gotcha" or edge case where the obvious answer is wrong. Expert-level required.`;

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildSystemPrompt(
    jdExtractedDetails: JdExtractedDetails,
    level: number,
    interviewType: "tech" | "conversational"
): string {
    const levelLabel = LEVEL_LABELS[level] ?? "Moderate";

    // Build a structured representation of the JD for the LLM
    const jobTitle = jdExtractedDetails.job_title?.trim() || "Unknown Role";
    const roleLevel = jdExtractedDetails.role_level?.trim() || "";
    const exp = jdExtractedDetails.experience;
    const criteria = jdExtractedDetails.criteria || [];
    const keywords = jdExtractedDetails.keywords || [];
    const greenFlags = jdExtractedDetails.scoring_hints?.green_flags_to_reward || [];

    const mustHaves = criteria.filter((c) => c.priority === "critical" || c.priority === "high");
    const niceToHaves = criteria.filter((c) => c.priority !== "critical" && c.priority !== "high");

    const mustHaveText = mustHaves.length
        ? mustHaves.map((c) => `  - [${c.category}] ${c.name}${c.source_text ? ` ("${c.source_text}")` : ""}`).join("\n")
        : "  (none specified)";

    const niceToHaveText = niceToHaves.length
        ? niceToHaves.map((c) => `  - [${c.category}] ${c.name}`).join("\n")
        : "";

    const greenFlagText = greenFlags.length
        ? `What a GREAT candidate looks like for this role:\n${greenFlags.map((g) => `  - ${g}`).join("\n")}`
        : "";

    const keywordText = keywords.length ? `Key technologies/skills: ${keywords.join(", ")}` : "";

    const expText = exp
        ? [
              exp.min_years != null ? `${exp.min_years}+ years experience` : "",
              exp.preferred_background?.trim() || "",
          ]
              .filter(Boolean)
              .join(", ")
        : "";

    const techSnippetRules = `
SNIPPET QUESTIONS (snippet_code and snippet_query):
- Include these ONLY when they genuinely fit the role's skill profile. Do NOT force them.
- For snippet_code: use a programming language directly drawn from the JD's must-have skills.
- For snippet_query: use SQL or another query language only if database/query skills are must-haves.
- The "question" field for snippet types MUST be a descriptive INTENT string describing the concept being tested
  (e.g. "Python code question testing mutable default argument gotcha" or
  "SQL query testing understanding of LEFT JOIN null filtering").
  NEVER put the actual code in the "question" field. The live agent generates the real code at interview time.
- Set snippet, snippet_language, and expected_output to null for these types.
  The live agent produces the actual code card at ask-time using the subtopic and candidate context.
${SNIPPET_DIFFICULTY_RUBRIC}`;

    const conversationalRules = `
- Every question must be "conceptual" type. Do NOT generate snippet_code or snippet_query.
- Favor situational, behavioral, and experience-based questions calibrated to difficulty ${level} (${levelLabel}).
- Higher levels probe deeper judgment, ambiguity tolerance, and stakes — not technical depth.`;

    return `You are a senior technical interviewer generating a high-quality, role-specific interview question bank.

═══════════════════════════════
ROLE BEING HIRED FOR
═══════════════════════════════
Job Title: ${jobTitle}${roleLevel ? `\nLevel: ${roleLevel}` : ""}${expText ? `\nExperience Expected: ${expText}` : ""}

MUST-HAVE SKILLS & REQUIREMENTS:
${mustHaveText}
${niceToHaveText.trim() ? `\nNICE-TO-HAVE SKILLS:\n${niceToHaveText}` : ""}
${keywordText ? `\n${keywordText}` : ""}
${greenFlagText ? `\n${greenFlagText}` : ""}

═══════════════════════════════
DIFFICULTY
═══════════════════════════════
Target Level: ${level} (${levelLabel})
${DIFFICULTY_DEFINITION}

═══════════════════════════════
RULES FOR QUESTION GENERATION
═══════════════════════════════
1. Generate EXACTLY ${TARGET_QUESTIONS} questions total.
2. PRIORITIZE must-have skills heavily — spend at least 70% of questions on must-have criteria.
   Give each must-have skill at least 1 question. Nice-to-haves can get 0-1 questions max.
3. Assign each question a "skill" (e.g. "Python", "System Design") and a "subtopic"
   (e.g. "Memory Management", "CAP Theorem") — these are used for scoring and interview structure.
   Subtopics must be specific and distinct sub-areas, NOT vague labels like "Basics" or "General".
4. Questions must be ROLE-SPECIFIC and SCENARIO-BASED where the level allows.
   Do NOT write generic textbook recall questions when the JD gives enough context for something sharper.
   Example of BAD: "What is a deadlock?" 
   Example of GOOD (for a Backend Engineer role): "You notice a transaction that holds a DB lock 
   is waiting on a Redis lock, while another thread holds the Redis lock and waits for the DB — 
   how would you detect and resolve this in production?"
5. Every question must be answerable by voice in a live interview — no diagrams, no multi-part 
   compound questions, max ~2 sentences.
${interviewType === "tech" ? techSnippetRules : conversationalRules}

═══════════════════════════════
OUTPUT FORMAT
═══════════════════════════════
Return strict JSON only:
{
  "level": ${level},
  "questions": [
    {
      "skill": "Python",
      "subtopic": "Memory Management",
      "question_type": "conceptual",
      "question": "Your service is slowly leaking memory over 24 hours. Walk me through how you'd identify if it's a Python object reference cycle causing it."
    },
    {
      "skill": "PostgreSQL",
      "subtopic": "Query Optimization",
      "question_type": "snippet_query",
      "question": "SQL query testing understanding of why a multi-column index doesn't get used when the leading column is skipped in a WHERE clause."
    }
  ]
}

All ${TARGET_QUESTIONS} questions must be in the "questions" array.
For conceptual questions, the "question" field is the scenario or concept to test.
For snippet_code/snippet_query questions, the "question" field is the descriptive INTENT only — the live agent generates the actual code on the fly.`;
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

const VALID_TYPES: BankQuestionType[] = ["conceptual", "snippet_code", "snippet_query"];

// Code/SQL must never appear literally in the spoken question field
const CODE_LEAKAGE_PATTERNS = [
    /\n/, // multi-line
    /\bSELECT\b[\s\S]*\bFROM\b/i, // real query shape
    /\bdef\s+\w+\(/,
    /\bfunction\s+\w+\(/,
    /[{};]/,
];

function hasCodeLeakage(question: string): boolean {
    return CODE_LEAKAGE_PATTERNS.some((re) => re.test(question));
}

function isCompoundOrTooLong(question: string): boolean {
    const questionMarks = (question.match(/\?/g) || []).length;
    if (questionMarks > 1) return true;
    if (question.length > 350) return true;
    return false;
}

function normalizeKey(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateQuestionBank(raw: unknown): ValidatedQuestionBank {
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as any).questions)) {
        throw new LLMCallError("Question generation response missing a 'questions' array");
    }
    const rawQuestions = (raw as any).questions;

    if (rawQuestions.length < TARGET_QUESTIONS - 2 || rawQuestions.length > TARGET_QUESTIONS + 2) {
        throw new LLMCallError(
            `Question generation returned ${rawQuestions.length} questions, expected ~${TARGET_QUESTIONS} (±2)`
        );
    }

    // Collect all unique skills from the response
    const skillsInBank = new Set<string>();
    rawQuestions.forEach((q: any) => {
        if (typeof q?.skill === "string" && q.skill.trim()) {
            skillsInBank.add(normalizeKey(q.skill.trim()));
        }
    });

    if (skillsInBank.size < 2) {
        throw new LLMCallError(
            `Question bank only covers ${skillsInBank.size} skill(s) — expected coverage of at least 2 distinct skills`
        );
    }

    const questions: BankQuestion[] = [];

    for (const q of rawQuestions) {
        if (!q || typeof q !== "object") {
            throw new LLMCallError("A question entry was not an object");
        }
        const { skill, subtopic, question_type, question } = q as Record<string, unknown>;

        if (typeof skill !== "string" || !skill.trim()) {
            throw new LLMCallError("A question entry is missing a valid 'skill' string");
        }
        if (typeof subtopic !== "string" || !subtopic.trim()) {
            throw new LLMCallError("A question entry is missing a valid 'subtopic' string");
        }
        if (typeof question !== "string" || !question.trim()) {
            throw new LLMCallError("A question entry is missing a valid 'question' string");
        }
        if (typeof question_type !== "string" || !VALID_TYPES.includes(question_type as BankQuestionType)) {
            throw new LLMCallError(`A question entry has invalid question_type "${question_type}"`);
        }

        const type = question_type as BankQuestionType;

        if (hasCodeLeakage(question)) {
            throw new LLMCallError(
                `Question field contains literal code/SQL — put intent in 'question', actual code is generated live: "${question.slice(0, 80)}"`
            );
        }
        if (isCompoundOrTooLong(question)) {
            throw new LLMCallError(
                `Question is compound or too long for voice delivery: "${question.slice(0, 80)}"`
            );
        }

        questions.push({
            id: randomUUID(),
            skill: skill.trim(),
            subtopic: subtopic.trim(),
            question_type: type,
            question: question.trim(),
            level: typeof (raw as any).level === "number" ? (raw as any).level : 2,
            source: "generated",
            edited: false,
        });
    }

    return { questions };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Single LLM call to generate a smart, JD-aware question bank directly from
 * the structured jdExtractedDetails already stored in the DB.
 *
 * No longer requires a prior skill-extraction (Call A) or subtopic-decomposition
 * (Call B) step — those were redundant since jdExtractedDetails already contains
 * prioritized skills, criteria, scoring hints, and keywords.
 *
 * Snippet questions store descriptive intent in the `question` field.
 * The live agent generates the actual code/query at ask-time using the
 * subtopic + candidate's previous answer context.
 */
export async function generateQuestions(
    jdExtractedDetails: JdExtractedDetails | unknown,
    level: number,
    model: string,
    interviewType: "tech" | "conversational" = "tech",
    targetQuestions: number = 12
): Promise<ValidatedQuestionBank & { usage: ChatJSONResult["usage"] }> {
    // Parse if stored as a JSON string
    let details: JdExtractedDetails;
    try {
        details =
            typeof jdExtractedDetails === "string"
                ? (JSON.parse(jdExtractedDetails) as JdExtractedDetails)
                : (jdExtractedDetails as JdExtractedDetails);
    } catch {
        throw new LLMCallError("jdExtractedDetails is not valid JSON");
    }

    if (!details || typeof details !== "object") {
        throw new LLMCallError("jdExtractedDetails is empty or not an object");
    }

    const criteria = details.criteria;
    if (!Array.isArray(criteria) || criteria.length === 0) {
        throw new LLMCallError(
            "jdExtractedDetails has no criteria — extract the JD before generating questions"
        );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await chatJSON({
                model,
                systemPrompt: buildSystemPrompt(details, level, interviewType),
                userPrompt: `Generate the ${targetQuestions}-question bank now, following all rules exactly. Return strict JSON only.`,
                maxTokens: 8000,
            });
            const validated = validateQuestionBank(result.data);
            return { ...validated, usage: result.usage };
        } catch (err) {
            lastError = err;
            if (attempt < MAX_RETRIES) {
                // Small backoff before retry
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            }
        }
    }
    throw lastError instanceof Error
        ? lastError
        : new LLMCallError("Question generation failed after retries");
}
