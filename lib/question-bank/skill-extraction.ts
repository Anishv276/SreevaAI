import { chatJSON, LLMCallError } from "@/lib/openai-client";
import type { ExtractedSkill } from "./types";

const SYSTEM_PROMPT = `You are extracting the major skills required by a job description, for the
purpose of building an interview question bank later. This is a skill
extraction task ONLY -- do not generate subtopics, do not generate questions.

Rules:
- Extract only skills that are genuinely assessable in a technical/role
  interview (e.g. "Python", "System Design", "SQL Optimization",
  "Stakeholder Communication"). Do not extract company names, years of
  experience, degree requirements, or generic filler ("team player").
- Merge synonyms and overlapping phrasing into a single skill.
- Order skills roughly by how central they are to the role, most important first.
- Output between 4 and 12 skills.
- Return strict JSON only:
  {"skills": ["Skill Name", "Skill Name", ...]}`;

function buildUserPrompt(jdText: string): string {
    return `Job description:\n---\n${jdText}\n---`;
}

export class TooFewSkillsError extends Error {
    constructor(public readonly skillCount: number) {
        super(`JD too vague -- only ${skillCount} assessable skill(s) identified (minimum 4 required)`);
        this.name = "TooFewSkillsError";
    }
}

function parseSkills(raw: unknown): string[] {
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as any).skills)) {
        throw new LLMCallError("Skill extraction response missing a 'skills' array");
    }
    const skills = (raw as any).skills
        .filter((s: unknown) => typeof s === "string" && s.trim().length > 0)
        .map((s: string) => s.trim());
    if (skills.length === 0) {
        throw new LLMCallError("Skill extraction response had an empty 'skills' array");
    }
    return skills;
}

const MAX_RETRIES = 2;

/**
 * Call A: skill extraction. Retries up to MAX_RETRIES times only on
 * malformed/wrong-shape JSON. A well-formed response with fewer than 4
 * skills is NOT retried -- it's a business-rule failure (JD too vague) that
 * an identical retry can't fix; it surfaces immediately as TooFewSkillsError.
 */
export async function extractSkills(
    jdText: string,
    model: string
): Promise<{ skills: ExtractedSkill[] }> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await chatJSON({
                model,
                systemPrompt: SYSTEM_PROMPT,
                userPrompt: buildUserPrompt(jdText),
                maxTokens: 1000,
            });
            const skills = parseSkills(result.data);
            if (skills.length < 4) {
                throw new TooFewSkillsError(skills.length);
            }
            if (skills.length > 12) {
                // Wrong-shape (spec violation) -- retryable.
                throw new LLMCallError(`Skill extraction returned ${skills.length} skills, expected <=12`);
            }
            return { skills: skills.map((skill) => ({ skill })) };
        } catch (err) {
            if (err instanceof TooFewSkillsError) {
                throw err;
            }
            lastError = err;
        }
    }
    throw lastError instanceof Error ? lastError : new LLMCallError("Skill extraction failed after retries");
}
