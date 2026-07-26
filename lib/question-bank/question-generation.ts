import { randomUUID } from "crypto";
import { chatJSON, LLMCallError } from "@/lib/openai-client";
import type { BankQuestion, BankQuestionType, SkillSubtopics } from "./types";

export const MIN_QUESTIONS = 15;
export const MAX_QUESTIONS = 20;

const LEVEL_LABELS: Record<number, string> = {
    1: "Easy",
    2: "Moderate",
    3: "Difficult",
    4: "Extreme",
};

const DIFFICULTY_DEFINITION = `Difficulty definition -- follow it exactly:
  Level 1 (Easy): Definitional/recall. Tests basic familiarity only.
  Level 2 (Moderate): Applied understanding. Tests practical grasp.
  Level 3 (Difficult): Scenario/trade-off based reasoning.
  Level 4 (Extreme): Deep expert-level reasoning, ambiguous/edge-case
    scenarios, intended for senior/expert candidates.`;

const SNIPPET_DIFFICULTY_RUBRIC = `Snippet difficulty rubric -- the SAME level applies to snippet questions as
every other question in this batch. Do not default to an easy or arbitrary
snippet regardless of the selected level:
  Level 1 (Easy): obvious, directly-traceable output. No tricks.
  Level 2 (Moderate): requires tracing execution/query logic step by step,
    but nothing hidden or subtle.
  Level 3 (Difficult): contains a genuine subtlety -- a real bug, a scoping
    quirk, a join that silently drops rows -- that requires real reasoning
    to catch.
  Level 4 (Extreme): a classic "gotcha" or edge case where the obvious
    answer is wrong; expert-level reasoning required.`;

function buildSkillSubtopicMapText(map: SkillSubtopics[]): string {
    return map.map((s) => `- ${s.skill}: ${s.subtopics.join(", ")}`).join("\n");
}

function buildSystemPrompt(level: number, skillSubtopicMap: SkillSubtopics[]): string {
    const levelLabel = LEVEL_LABELS[level] ?? "Moderate";
    return `You are generating interview questions for this job description at
difficulty level ${level} (${levelLabel}).

${DIFFICULTY_DEFINITION}

Skill/subtopic map:
${buildSkillSubtopicMapText(skillSubtopicMap)}

Rules:
- Generate BETWEEN ${MIN_QUESTIONS} AND ${MAX_QUESTIONS} questions total,
  across ALL skills and subtopics combined -- this is a hard cap, not a
  per-subtopic count. Never fewer than ${MIN_QUESTIONS}, never more than ${MAX_QUESTIONS}.
- Distribute the questions across skills to give the broadest reasonable
  coverage. Every skill should get at least 1 question if the skill count
  allows it; do not spend them all on a single skill.
- Not every subtopic will receive a question -- that is expected and fine.
- WITHIN that total, include AT LEAST 1 question of type "snippet_code" and AT
  LEAST 1 question of type "snippet_query":
  - Both snippet questions MUST match difficulty level ${level} (${levelLabel})
    using the exact same rubric as every other question in this batch:
    ${SNIPPET_DIFFICULTY_RUBRIC}
  - snippet_code: a short code snippet (roughly 5-15 lines) in a language
    drawn from this JD's extracted skills, calibrated to the level above.
    The candidate will see this snippet on screen and be asked, by voice,
    what it outputs.
  - snippet_query: same idea, but a short SQL (or other query-language)
    snippet against a small implied schema, calibrated to the level above.
  - For BOTH types, the "question" field must be a short natural verbal
    prompt only (e.g. "Take a look at the snippet on your screen -- what
    would this output?") -- it must NEVER contain the code itself. The code
    goes only in the separate "snippet" field, matching how it will be
    displayed to the candidate, never read aloud.
  - Also return "snippet_language" and "expected_output" (the correct
    output/result) for each snippet question -- expected_output is for
    internal scoring only, never shown or spoken to the candidate.
  - If, and only if, this JD's extracted skills contain no database/query-
    language skill at all, the snippet_query requirement cannot be met --
    in that case set the top-level "skipped_query_snippet_reason" field to
    a short explanation instead of forcing an irrelevant query question.
    Do not invent a database skill that isn't in this JD to satisfy the rule.
  - If, and only if, this JD's extracted skills contain no programming-
    language skill at all (rare -- e.g. a narrowly infra/ops-focused role),
    the snippet_code requirement cannot be met -- set the top-level
    "skipped_code_snippet_reason" field instead of forcing an irrelevant
    code question. This should be uncommon; only use it when truly no
    programming-language skill exists in this JD.
- Every non-snippet question must be answerable by voice in a live
  interview -- no multi-part compound questions, no diagrams, no questions
  longer than ~2 sentences.
- Return strict JSON only, between ${MIN_QUESTIONS} and ${MAX_QUESTIONS} items:
  {"level": ${level}, "questions": [
    {"skill": "...", "subtopic": "...", "question_type": "conceptual", "question": "..."},
    {"skill": "...", "subtopic": "...", "question_type": "snippet_code",
     "question": "Take a look at the snippet on your screen -- what would this output?",
     "snippet": "...", "snippet_language": "python", "expected_output": "..."},
    {"skill": "...", "subtopic": "...", "question_type": "snippet_query",
     "question": "...", "snippet": "SELECT ...", "snippet_language": "sql",
     "expected_output": "..."}
    ... between ${MIN_QUESTIONS} and ${MAX_QUESTIONS} entries
  ], "skipped_query_snippet_reason": null, "skipped_code_snippet_reason": null}`;
}

const VALID_TYPES: BankQuestionType[] = ["conceptual", "snippet_code", "snippet_query"];

// Heuristics for "the question field must never contain code/SQL literally".
// Note: plain keyword matches like /\bFROM\s/i are too broad -- "different
// FROM a tuple" is ordinary English, not SQL leakage. Require actual
// SQL/code shape (a SELECT...FROM pair, a function/def declaration, or
// structural punctuation) before flagging.
const CODE_LEAKAGE_PATTERNS = [
    /\n/, // multi-line
    /\bSELECT\b[\s\S]*\bFROM\b/i, // real query shape, not a bare keyword
    /\bdef\s+\w+\(/,
    /\bfunction\s+\w+\(/,
    /[{};]/,
];

// Heuristic compound-question check: multiple '?' or an " and " joining two
// distinct clauses that both look like questions.
function isCompoundOrTooLong(question: string): boolean {
    const questionMarks = (question.match(/\?/g) || []).length;
    if (questionMarks > 1) return true;
    if (question.length > 320) return true;
    return false;
}

function hasCodeLeakage(question: string): boolean {
    return CODE_LEAKAGE_PATTERNS.some((re) => re.test(question));
}

// LLMs reliably preserve the MEANING of a skill/subtopic string they were
// given, but not always its exact casing/whitespace when echoing it back in
// a later field -- normalize before comparing so a benign drift (e.g. "Data
// Structures" vs "Data structures") doesn't burn a retry over a non-issue.
function normalizeKey(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Clear-cut level/complexity mismatches only -- true "is this genuinely
// tricky" judgment is a model call, not a heuristic, so this only catches
// obvious violations (a one-line snippet claimed as L4 "gotcha", or an L1
// snippet that's clearly not directly-traceable), per spec: "treat an
// obvious mismatch the same as any other malformed output."
function snippetLevelMismatch(snippet: string, level: number): string | null {
    const lineCount = snippet.split("\n").filter((l) => l.trim()).length;
    if (level >= 3 && lineCount <= 2) {
        return `Level ${level} snippet is only ${lineCount} line(s) -- too trivial to contain a genuine subtlety or edge case`;
    }
    if (level === 1) {
        // Obvious "gotcha" markers that contradict "no tricks" at L1.
        const gotchaMarkers = [/mutable default/i, /\bJOIN\b[\s\S]*\bJOIN\b/i, /race condition/i, /floating[- ]point/i];
        if (gotchaMarkers.some((re) => re.test(snippet))) {
            return `Level 1 snippet appears to contain a non-obvious gotcha, which contradicts the "no tricks" rule for this level`;
        }
    }
    return null;
}

export type ValidatedQuestionBank = {
    questions: BankQuestion[];
    skippedQuerySnippetReason: string | null;
    skippedCodeSnippetReason: string | null;
};

/**
 * Validates a raw Call C response against every spec rule. Throws
 * LLMCallError (retryable) on any violation.
 */
export function validateQuestionBank(
    raw: unknown,
    skillSubtopicMap: SkillSubtopics[],
    level: number
): ValidatedQuestionBank {
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as any).questions)) {
        throw new LLMCallError("Question generation response missing a 'questions' array");
    }
    const rawQuestions = (raw as any).questions;
    if (rawQuestions.length < MIN_QUESTIONS || rawQuestions.length > MAX_QUESTIONS) {
        throw new LLMCallError(
            `Question generation returned ${rawQuestions.length} questions, expected between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}`
        );
    }

    // Normalized skill key -> { canonical skill name, normalized subtopic key -> canonical subtopic name }.
    const validSkillSubtopics = new Map<string, { canonicalSkill: string; subtopics: Map<string, string> }>();
    for (const entry of skillSubtopicMap) {
        const subtopics = new Map<string, string>();
        for (const subtopic of entry.subtopics) {
            subtopics.set(normalizeKey(subtopic), subtopic);
        }
        validSkillSubtopics.set(normalizeKey(entry.skill), { canonicalSkill: entry.skill, subtopics });
    }

    const skippedQuerySnippetReason: string | null =
        typeof (raw as any).skipped_query_snippet_reason === "string" && (raw as any).skipped_query_snippet_reason.trim()
            ? (raw as any).skipped_query_snippet_reason.trim()
            : null;
    const skippedCodeSnippetReason: string | null =
        typeof (raw as any).skipped_code_snippet_reason === "string" && (raw as any).skipped_code_snippet_reason.trim()
            ? (raw as any).skipped_code_snippet_reason.trim()
            : null;

    const questions: BankQuestion[] = [];
    let sawSnippetCode = false;
    let sawSnippetQuery = false;

    for (const q of rawQuestions) {
        if (!q || typeof q !== "object") {
            throw new LLMCallError("A question entry was not an object");
        }
        const { skill, subtopic, question_type, question, snippet, snippet_language, expected_output } = q as Record<string, unknown>;
        if (typeof skill !== "string" || typeof subtopic !== "string" || typeof question !== "string") {
            throw new LLMCallError("A question entry is missing required string fields");
        }
        if (typeof question_type !== "string" || !VALID_TYPES.includes(question_type as BankQuestionType)) {
            throw new LLMCallError(`A question entry has invalid question_type "${question_type}"`);
        }
        const skillEntry = validSkillSubtopics.get(normalizeKey(skill));
        if (!skillEntry) {
            throw new LLMCallError(`Question references unknown skill "${skill}"`);
        }
        const canonicalSubtopic = skillEntry.subtopics.get(normalizeKey(subtopic));
        if (!canonicalSubtopic) {
            throw new LLMCallError(`Question references unknown subtopic "${subtopic}" for skill "${skill}"`);
        }
        // Store using Call B's canonical casing, not whatever casing Call C
        // happened to echo back -- keeps skill/subtopic values consistent
        // across the whole bank regardless of per-question drift.
        const canonicalSkill = skillEntry.canonicalSkill;

        const type = question_type as BankQuestionType;
        if (type === "snippet_code" || type === "snippet_query") {
            if (typeof snippet !== "string" || !snippet.trim()) {
                throw new LLMCallError(`A ${type} question is missing its 'snippet' field`);
            }
            if (typeof snippet_language !== "string" || !snippet_language.trim()) {
                throw new LLMCallError(`A ${type} question is missing its 'snippet_language' field`);
            }
            if (typeof expected_output !== "string" || !expected_output.trim()) {
                throw new LLMCallError(`A ${type} question is missing its 'expected_output' field`);
            }
            const mismatch = snippetLevelMismatch(snippet, level);
            if (mismatch) {
                throw new LLMCallError(`${type} question fails level-${level} calibration: ${mismatch}`);
            }
            if (type === "snippet_code") sawSnippetCode = true;
            if (type === "snippet_query") sawSnippetQuery = true;
        }

        if (hasCodeLeakage(question)) {
            throw new LLMCallError(`Question field contains literal code/SQL -- must be in 'snippet' only: "${question.slice(0, 80)}"`);
        }
        if (isCompoundOrTooLong(question)) {
            throw new LLMCallError(`Question is compound or too long for voice delivery: "${question.slice(0, 80)}"`);
        }

        questions.push({
            id: randomUUID(),
            skill: canonicalSkill,
            subtopic: canonicalSubtopic,
            question_type: type,
            question: question.trim(),
            snippet: typeof snippet === "string" ? snippet : null,
            snippet_language: typeof snippet_language === "string" ? snippet_language : null,
            expected_output: typeof expected_output === "string" ? expected_output : null,
            level,
            source: "generated",
            edited: false,
        });
    }

    if (!sawSnippetCode && !skippedCodeSnippetReason) {
        throw new LLMCallError(
            "Question bank has no 'snippet_code' question and no 'skipped_code_snippet_reason' was given"
        );
    }
    if (!sawSnippetQuery && !skippedQuerySnippetReason) {
        throw new LLMCallError(
            "Question bank has no 'snippet_query' question and no 'skipped_query_snippet_reason' was given"
        );
    }
    if (skippedCodeSnippetReason && skippedQuerySnippetReason) {
        // Both waived -- this JD likely isn't genuinely "technical" in the
        // intended sense. Not a retryable failure (retrying an identical
        // prompt won't manufacture skills that aren't in the JD), but must
        // be surfaced for admin review rather than silently proceeding with
        // zero snippet questions.
        console.warn(
            `[question-generation] Both snippet types skipped for this JD -- code: ${skippedCodeSnippetReason} | query: ${skippedQuerySnippetReason}. Flagging for admin review.`
        );
    }

    return { questions, skippedQuerySnippetReason, skippedCodeSnippetReason };
}

const MAX_RETRIES = 2;

/**
 * Call C: question generation. Generates between MIN_QUESTIONS and
 * MAX_QUESTIONS questions, hard-capped, validated against every spec rule
 * (count, distribution coverage, snippet type invariants, no code leakage
 * into the spoken question text, length/compound checks). Retries up to
 * MAX_RETRIES times on any validation failure; if retries are exhausted,
 * throws -- callers must NOT persist a partial/out-of-range bank.
 */
export async function generateQuestions(
    jdText: string,
    skillSubtopicMap: SkillSubtopics[],
    level: number,
    model: string
): Promise<ValidatedQuestionBank> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await chatJSON({
                model,
                systemPrompt: buildSystemPrompt(level, skillSubtopicMap),
                userPrompt: `Produce the ${MIN_QUESTIONS}-${MAX_QUESTIONS} question bank now, following the rules exactly.`,
                maxTokens: 8000,
            });
            return validateQuestionBank(result.data, skillSubtopicMap, level);
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError instanceof Error ? lastError : new LLMCallError("Question generation failed after retries");
}
