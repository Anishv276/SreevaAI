import { randomUUID } from "crypto";
import { chatJSON, LLMCallError, type ChatJSONResult } from "@/lib/openai-client";
import type { BankQuestion, BankQuestionType, QuestionFormatType } from "./types";

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

const DEFAULT_TARGET_QUESTIONS = 12;
const MAX_RETRIES = 2;

const LEVEL_LABELS: Record<number, string> = {
    1: "Fresher",
    2: "Intermediate",
    3: "Senior",
    4: "Expert/Lead/Staff",
};

// ─── Rule 1 — level is a cognitive operation, not vocabulary ─────────────────
// Escalation across levels happens ONLY via these structural drivers. Never by
// bolting words like "efficiently"/"at scale"/"robustly" onto an unchanged scenario.
const ESCALATION_DRIVERS = `Escalation drivers — the ONLY legal ways to make a question harder:
  (a) Number of plausible root causes (1 -> 2+ -> cross-layer -> ambiguous/unknown)
  (b) Number of competing constraints the answer must balance (0 -> 1 -> 2+ -> team/org-scale)
  (c) Completeness of information given (fully specified -> partially specified -> candidate must state assumptions)
  (d) Blast radius of the decision (single method -> single service -> team standard -> org-wide policy)
Never escalate by inserting words like "efficiently," "at scale," "properly," "under load," or
"robustly" onto an otherwise unchanged scenario — that is a generation error.`;

// ─── Rule 2 — per-level definitions, verbs, and mandatory format-type quotas ─
const DIFFICULTY_LEVELS: Record<number, { label: string; spec: string }> = {
    1: {
        label: "Fresher (0-1 yr)",
        spec: `LEVEL 1 — Fresher (0-1 yr)
Verb: DEFINE / IDENTIFY / DIFFERENTIATE / DO
Root causes: 0-1 (single, obvious). Constraints: 0. Info: fully specified.
Persona: an individual contributor learning the role. NEVER an architect/ownership persona
  (no "as the tech lead...", no team/org framing).
Mandatory mix across this level's questions (do not make every question the same type):
  - ~40% Definition/Compare-Contrast: "What is X?" / "Difference between A and B?"
  - ~30% Minimal-Snippet/applied: one small, self-contained thing to write or do —
        no production framing, no failure state
  - ~30% Bounded-Scenario: one clear action, one clear correct path, no trade-off
Forbidden: production incidents, "intermittent" symptoms, multi-cause bugs,
concurrency/race conditions, any system-design framing, any team/org-scale framing.`,
    },
    2: {
        label: "Intermediate (1-3 yr)",
        spec: `LEVEL 2 — Intermediate (1-3 yr)
Verb: APPLY / JUSTIFY / IMPLEMENT / CHOOSE-BETWEEN
Root causes: 1, but requires reasoning to find (not obvious on first read).
Constraints: 1. Info: fully specified.
Persona: an individual contributor implementing/owning a bounded piece of work. NEVER an
  architect/ownership persona, never team/org-scale framing.
Mandatory mix:
  - ~40% Trade-off-Justify: "Why X over Y here?" — requires comparative reasoning, not
        just naming the right answer
  - ~40% Bounded-Scenario: single root cause, single fix, candidate DESIGNS the fix
        (not just identifies it)
  - ~20% Minimal-Snippet applied build: implement one bounded feature end-to-end
Forbidden: multi-layer/cross-system diagnosis, ambiguous or unknown-cause symptoms,
team-scale or org-scale design, unstated/missing information.`,
    },
    3: {
        label: "Senior (3-6 yr)",
        spec: `LEVEL 3 — Senior (3-6 yr)
Verb: DIAGNOSE / ANALYZE / OPTIMIZE UNDER CONSTRAINT
Root causes: 2+, spanning at least two layers/components. Constraints: 2+ (competing,
  e.g. speed vs consistency, cost vs reliability). Info: mostly specified, one ambiguous element.
Persona: someone who owns a service/component and diagnoses/optimizes it themselves.
  Not yet org-scale ownership.
Mandatory mix:
  - ~60% Multi-cause-Diagnostic: candidate must describe a systematic elimination
        process across layers, not just name a fix
  - ~40% Constrained-Design: two goals genuinely conflict; candidate must pick and
        defend a choice, stating what they are trading away
Required: at least one question in this level uses a "despite X already being in place"
  twist (e.g. "slow despite indexes," "still flaky despite retries," "still coupled despite
  an abstraction layer") to block the obvious first-guess answer.`,
    },
    4: {
        label: "Expert/Lead/Staff (6+ yr)",
        spec: `LEVEL 4 — Expert/Lead/Staff (6+ yr)
Verb: ARCHITECT / SET STRATEGY / EVALUATE TRADE-OFFS FOR OTHERS
Root causes: ambiguous/unknown at question time — candidate must define how they would
  even find out. Constraints: 3+, including non-technical ones (team size, timeline,
  org politics, cost). Info: deliberately incomplete — candidate must state assumptions.
Persona: someone who sets direction, owns a system, or mentors others. NEVER a junior/IC-only
  persona ("as a junior developer, how would you...") — that is a generation error.
Mandatory mix:
  - ~50% System-Design: multi-service/multi-environment/team-scale; candidate defines
        a standard, policy, or framework others will follow — not a single fix
  - ~50% Judgment-under-Ambiguity: incomplete information, competing stakeholder needs;
        candidate must state assumptions explicitly and defend a decision framework
Voice-delivery note: at most ONE main question mark plus ONE short clarifying follow-up
  question mark is allowed (e.g. "...how would you decide X? What would you weigh?") —
  never more than two "?" total, and never a laundry list of sub-questions.`,
    },
};

// ─── Rule 3 — fixed format-type taxonomy (identical for every role/level) ────
const FORMAT_TYPE_TAXONOMY = `Format-Type taxonomy (fixed — use exactly one of these per question, verbatim):
  Definition | Compare-Contrast | Minimal-Snippet | Bounded-Scenario | Trade-off-Justify |
  Multi-cause-Diagnostic | Constrained-Design | System-Design | Judgment-under-Ambiguity
This taxonomy is identical for every role — do not invent a role-specific category
(e.g. don't make a "Query Snippet" SQL-only category; if Minimal-Snippet applies to SQL,
the equivalent applies to a config snippet, shell command, small function, or CLI
invocation for non-database roles — whatever is native to the role).`;

const SNIPPET_DIFFICULTY_RUBRIC = `Snippet difficulty rubric (Minimal-Snippet / snippet_code / snippet_query format, same
level rules as every other format):
  Level 1: Obvious, directly-traceable output. No tricks. Self-contained, no failure state.
  Level 2: Requires tracing execution/query logic step by step — no hidden subtleties.
        Candidate builds/extends it, not just reads it.
  Level 3: Contains a genuine subtlety (a real bug, scoping quirk, a join that silently
        drops rows) requiring real reasoning — a "despite X already in place" trap is ideal here.
  Level 4: A classic "gotcha" or edge case where the obvious answer is wrong. Expert-level
        required; may be framed as something the candidate must set a team standard around.
Code is always DYNAMIC and generated per-candidate at interview time — never store literal
code in the question bank (see rules below).`;

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildSystemPrompt(
    jdExtractedDetails: JdExtractedDetails,
    level: number,
    interviewType: "tech" | "conversational",
    targetQuestions: number
): string {
    const levelLabel = LEVEL_LABELS[level] ?? "Intermediate";
    const levelSpec = DIFFICULTY_LEVELS[level] ?? DIFFICULTY_LEVELS[2];
    const levelBelowSpec = level > 1 ? DIFFICULTY_LEVELS[level - 1] : null;

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
DIFFICULTY — LEVEL = COGNITIVE OPERATION, NOT VOCABULARY
═══════════════════════════════
Target Level: ${level} (${levelLabel})

${ESCALATION_DRIVERS}

${levelSpec.spec}
${levelBelowSpec ? `\nFor reference, the level directly below (Level ${level - 1}, ${levelBelowSpec.label}) is strictly easier on root-cause count and constraint count than this level — every question you write at Level ${level} must clearly exceed it on at least one escalation driver (a/b/c/d above).` : ""}

${FORMAT_TYPE_TAXONOMY}

═══════════════════════════════
RULES FOR QUESTION GENERATION
═══════════════════════════════
1. Generate EXACTLY ${targetQuestions} questions total.
2. PRIORITIZE must-have skills heavily — spend at least 70% of questions on must-have criteria.
   Give each must-have skill at least 1 question. Nice-to-haves can get 0-1 questions max.
3. Assign each question a "skill" (e.g. "Python", "System Design") and a "subtopic"
   (e.g. "Memory Management", "CAP Theorem") — these are used for scoring and interview structure.
   Subtopics must be specific and distinct sub-areas, NOT vague labels like "Basics" or "General".
   Use the SAME skill/subtopic vocabulary a human would use for this role at every level — do not
   rename a subtopic just because the level changed (Rule 5: topic/subtopic labels are frozen
   across levels so questions stay diffable against neighboring levels).
4. Questions must be ROLE-SPECIFIC and calibrated to the format-type mix required for this level
   (see DIFFICULTY section above). Do NOT write generic textbook recall questions when the JD
   gives enough context for something sharper, and do NOT reuse a generic example from another
   discipline — vocabulary and failure modes must be native to this role.
   Example of BAD: "What is a deadlock?"
   Example of GOOD (for a Backend Engineer role, Level 3): "A service still deadlocks intermittently
   despite you adding a fixed lock-acquisition order last sprint — walk through how you'd isolate
   the remaining cause across the DB and cache layers."
5. Every question must be answerable by voice in a live interview — no diagrams, no multi-part
   compound questions, max ~2 sentences.
6. PERSONA LOCK — check every question against the level's persona rule before finalizing:
   Level 1-2 questions must use an individual-contributor persona (never "as the tech lead...").
   Level 4 questions must never use a junior/IC-only persona ("as a junior developer, how would you...").
   A question that violates its level's persona rule is a generation error — rewrite it.
7. ANTI-DUPLICATION — before finalizing, mentally diff each question against the others in this
   batch: no two questions should share the same root-cause count, constraint count, and format-type
   combination unless they test a genuinely distinct subtopic. Do not pad the bank with near-duplicates.
8. For every question, determine "root_cause_count" and "constraint_count" as short labels matching
   this level's spec (e.g. "0-1", "1", "2+", "ambiguous/unknown"; "0", "1", "2+", "3+ (incl. non-technical)"),
   and "skill_tested" as one line naming the specific reasoning being evaluated — not the "correct fact".
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
      "format_type": "Multi-cause-Diagnostic",
      "root_cause_count": "2+",
      "constraint_count": "1",
      "skill_tested": "Systematic elimination of GC/reference-cycle vs external-fd leak causes across process boundaries",
      "question": "Your service is slowly leaking memory over 24 hours. Walk me through how you'd identify if it's a Python object reference cycle causing it."
    },
    {
      "skill": "PostgreSQL",
      "subtopic": "Query Optimization",
      "question_type": "snippet_query",
      "format_type": "Minimal-Snippet",
      "root_cause_count": "1",
      "constraint_count": "0",
      "skill_tested": "Tracing how column order in a composite index affects planner index selection",
      "question": "SQL query testing understanding of why a multi-column index doesn't get used when the leading column is skipped in a WHERE clause."
    }
  ]
}

All ${targetQuestions} questions must be in the "questions" array.
Every question must include: skill, subtopic, question_type, format_type (one of the fixed
Format-Type taxonomy values, exactly as spelled), root_cause_count, constraint_count,
skill_tested, and question.
For conceptual questions, the "question" field is the scenario or concept to test.
For snippet_code/snippet_query questions, the "question" field is the descriptive INTENT only — the live agent generates the actual code on the fly.`;
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

const VALID_TYPES: BankQuestionType[] = ["conceptual", "snippet_code", "snippet_query"];

const VALID_FORMAT_TYPES: QuestionFormatType[] = [
    "Definition",
    "Compare-Contrast",
    "Minimal-Snippet",
    "Bounded-Scenario",
    "Trade-off-Justify",
    "Multi-cause-Diagnostic",
    "Constrained-Design",
    "System-Design",
    "Judgment-under-Ambiguity",
];

function coerceOptionalString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

function coerceFormatType(v: unknown): QuestionFormatType | null {
    return typeof v === "string" && VALID_FORMAT_TYPES.includes(v as QuestionFormatType)
        ? (v as QuestionFormatType)
        : null;
}

// Self-heal for a recurring LLM slip: writing the format_type value (e.g.
// "Minimal-Snippet") into the question_type field instead of the real
// question_type ("snippet_code"/"snippet_query"/"conceptual"). Rather than
// discard the whole question batch (and the real tokens already spent
// generating it) over one mislabeled field, recover the intended
// question_type from context. Only engages when question_type is literally
// a format_type string -- a genuinely invalid/garbage question_type still
// fails validation as before.
function recoverQuestionType(
    question_type: unknown,
    format_type: unknown,
    skill: unknown,
    subtopic: unknown
): BankQuestionType | null {
    if (typeof question_type !== "string" || !VALID_FORMAT_TYPES.includes(question_type as QuestionFormatType)) {
        return null;
    }
    // The real format_type field is empty/invalid (the model swapped the two),
    // so the question_type field is carrying "Minimal-Snippet" et al. Only
    // "Minimal-Snippet" implies a snippet question_type; every other format
    // value (Definition, Trade-off-Justify, ...) implies plain "conceptual".
    if (question_type !== "Minimal-Snippet") {
        return "conceptual";
    }
    const haystack = `${String(skill || "")} ${String(subtopic || "")}`.toLowerCase();
    return /\b(sql|query|postgres|mysql|database|db)\b/.test(haystack) ? "snippet_query" : "snippet_code";
}

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

// Level 4 questions legitimately need more setup (3+ constraints, stated
// assumptions, org context per Rule 2) than lower levels' single-cause scenarios.
const MAX_QUESTION_LENGTH_BY_LEVEL: Record<number, number> = {
    1: 350,
    2: 350,
    3: 350,
    4: 550,
};

// Level 4's system-design/ambiguity framing naturally reads as a main question
// plus one clarifying follow-up ("...how would you decide X? What would you weigh?").
// Lower levels stay single-cause/single-fix, so a second "?" there signals poor calibration.
const MAX_QUESTION_MARKS_BY_LEVEL: Record<number, number> = {
    1: 1,
    2: 1,
    3: 1,
    4: 2,
};

function isCompoundOrTooLong(question: string, level: number): boolean {
    const questionMarks = (question.match(/\?/g) || []).length;
    const maxQuestionMarks = MAX_QUESTION_MARKS_BY_LEVEL[level] ?? 1;
    if (questionMarks > maxQuestionMarks) return true;
    const maxLength = MAX_QUESTION_LENGTH_BY_LEVEL[level] ?? 350;
    if (question.length > maxLength) return true;
    return false;
}

function normalizeKey(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateQuestionBank(
    raw: unknown,
    targetQuestions: number = DEFAULT_TARGET_QUESTIONS
): ValidatedQuestionBank {
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as any).questions)) {
        throw new LLMCallError("Question generation response missing a 'questions' array");
    }
    const rawQuestions = (raw as any).questions;
    const bankLevel = typeof (raw as any).level === "number" ? (raw as any).level : 2;

    // Small target counts (e.g. demo's 5) still get a ±2 tolerance band, but the
    // lower bound is clamped at 1 so it never goes negative/zero for tiny targets.
    const minQuestions = Math.max(1, targetQuestions - 2);
    const maxQuestions = targetQuestions + 2;
    if (rawQuestions.length < minQuestions || rawQuestions.length > maxQuestions) {
        throw new LLMCallError(
            `Question generation returned ${rawQuestions.length} questions, expected ~${targetQuestions} (±2)`
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
    // A single malformed entry (e.g. one snippet question leaking literal code)
    // used to fail the ENTIRE batch, discarding N-1 perfectly good questions and
    // burning a full retry (a fresh, billable LLM call) over one bad line. Instead,
    // drop only the offending entry and keep going -- we only give up on the whole
    // batch if too few valid questions survive (checked after the loop).
    const dropReasons: string[] = [];

    for (const q of rawQuestions) {
        if (!q || typeof q !== "object") {
            dropReasons.push("a question entry was not an object");
            continue;
        }
        const { skill, subtopic, question_type, question, format_type, root_cause_count, constraint_count, skill_tested } =
            q as Record<string, unknown>;

        if (typeof skill !== "string" || !skill.trim()) {
            dropReasons.push("a question entry is missing a valid 'skill' string");
            continue;
        }
        if (typeof subtopic !== "string" || !subtopic.trim()) {
            dropReasons.push("a question entry is missing a valid 'subtopic' string");
            continue;
        }
        if (typeof question !== "string" || !question.trim()) {
            dropReasons.push("a question entry is missing a valid 'question' string");
            continue;
        }
        let type: BankQuestionType;
        // Recovered format_type when the model wrote its value into question_type
        // instead of (or in addition to) the real format_type field.
        let recoveredFormatType: QuestionFormatType | null = null;
        if (typeof question_type === "string" && VALID_TYPES.includes(question_type as BankQuestionType)) {
            type = question_type as BankQuestionType;
        } else {
            const recovered = recoverQuestionType(question_type, format_type, skill, subtopic);
            if (!recovered) {
                dropReasons.push(`a question entry has invalid question_type "${question_type}"`);
                continue;
            }
            type = recovered;
            recoveredFormatType = question_type as QuestionFormatType;
        }

        if (hasCodeLeakage(question)) {
            dropReasons.push(
                `question field contained literal code/SQL (put intent in 'question', actual code is generated live): "${question.slice(0, 80)}"`
            );
            continue;
        }
        if (isCompoundOrTooLong(question, bankLevel)) {
            dropReasons.push(`question was compound or too long for voice delivery: "${question.slice(0, 80)}"`);
            continue;
        }

        questions.push({
            id: randomUUID(),
            skill: skill.trim(),
            subtopic: subtopic.trim(),
            question_type: type,
            question: question.trim(),
            level: bankLevel,
            source: "generated",
            edited: false,
            format_type: coerceFormatType(format_type) ?? recoveredFormatType,
            root_cause_count: coerceOptionalString(root_cause_count),
            constraint_count: coerceOptionalString(constraint_count),
            skill_tested: coerceOptionalString(skill_tested),
        });
    }

    // Only fail the batch if dropping bad entries left us below the tolerance
    // band already accepted above -- this is the same floor used for the raw
    // count check, so a batch that started acceptable-sized stays acceptable
    // unless too many individual questions were actually broken.
    if (questions.length < minQuestions) {
        const reasonSample = dropReasons.slice(0, 3).join("; ");
        throw new LLMCallError(
            `Only ${questions.length} of ${rawQuestions.length} generated questions were valid (need >= ${minQuestions}). Sample issues: ${reasonSample}`
        );
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
    targetQuestions: number = DEFAULT_TARGET_QUESTIONS
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

    // Accumulated across every attempt (including ones that failed validation
    // after a real, billable OpenAI call) so a retry never drops already-spent
    // tokens from billing -- only the final JSON payload comes from the
    // winning attempt.
    const totalUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
    let lastError: unknown;
    const systemPrompt = buildSystemPrompt(details, level, interviewType, targetQuestions);
    const baseUserPrompt = `Generate the ${targetQuestions}-question bank now, following all rules exactly. Return strict JSON only.`;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // On retry, tell the model exactly what it got wrong last time instead
            // of blindly re-rolling the identical prompt at temperature 0 (which
            // tends to reproduce the same mistake). Also nudge temperature up
            // slightly so the retry isn't a near-exact repeat of the failed output.
            const userPrompt =
                attempt === 0 || !lastError
                    ? baseUserPrompt
                    : `${baseUserPrompt}\n\nYour previous attempt was REJECTED for this reason: ${
                          lastError instanceof Error ? lastError.message : String(lastError)
                      }\nFix that specific problem in this new attempt while still following every other rule.`;

            const result = await chatJSON({
                model,
                systemPrompt,
                userPrompt,
                maxTokens: 8000,
                temperature: attempt === 0 ? 0 : 0.4,
            });
            totalUsage.inputTokens += result.usage.inputTokens;
            totalUsage.outputTokens += result.usage.outputTokens;
            totalUsage.cachedInputTokens += result.usage.cachedInputTokens;
            const validated = validateQuestionBank(result.data, targetQuestions);
            return { ...validated, usage: totalUsage };
        } catch (err) {
            lastError = err;
            if (attempt < MAX_RETRIES) {
                // Small backoff before retry
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            }
        }
    }
    const finalError =
        lastError instanceof Error ? lastError : new LLMCallError("Question generation failed after retries");
    // Every retry attempt above may have burned real, billable OpenAI tokens even
    // though none produced a usable result -- attach them so the caller can still
    // bill this before giving up, instead of silently writing off the spend.
    if (finalError instanceof LLMCallError && (totalUsage.inputTokens || totalUsage.outputTokens)) {
        finalError.partialUsage = totalUsage;
    }
    throw finalError;
}
