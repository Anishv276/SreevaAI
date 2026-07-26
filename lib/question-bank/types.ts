// Shared types for the JD skill-extraction / subtopic-decomposition /
// question-generation pipeline (Calls A/B/C). This taxonomy is intentionally
// separate from the LiveKit agent's live 9-type PROBE question menu
// (definition/mechanism/.../code_trace/snippet_eval/query_trace/followup,
// see livekit-python-agent/interview/tech/phases.py) -- that menu keeps
// governing only live follow-up generation during the interview. These types
// describe the fixed, stored, per-JD anchor question bank.

export type ExtractedSkill = {
    skill: string;
};

export type SkillSubtopics = {
    skill: string;
    subtopics: string[];
};

export type BankQuestionType = "conceptual" | "snippet_code" | "snippet_query" | "custom";

export type BankQuestion = {
    id: string;
    skill: string;
    subtopic: string;
    question_type: BankQuestionType;
    question: string;
    snippet?: string | null;
    snippet_language?: string | null;
    expected_output?: string | null;
    level: number;
    source: "generated" | "custom";
    edited: boolean;
};

export type QuestionBank = {
    version: number;
    level: number;
    generatedAt: string;
    questions: BankQuestion[];
    skippedQuerySnippetReason?: string | null;
    // Symmetric fallback for a JD with no programming-language skill at all
    // (e.g. narrowly infra/ops-focused roles). Uncommon -- unlike the query
    // skip, this should be logged for admin review, not treated as routine.
    skippedCodeSnippetReason?: string | null;
};
