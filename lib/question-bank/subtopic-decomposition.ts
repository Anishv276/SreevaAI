import { chatJSON, LLMCallError } from "@/lib/openai-client";
import type { ExtractedSkill, SkillSubtopics } from "./types";

const SYSTEM_PROMPT_TEMPLATE = (jdText: string, skillsList: string) => `You are decomposing the following skills into interview-worthy subtopics,
for this job description:
---
${jdText}
---

Skills: ${skillsList}

Rules:
- For each skill, produce BETWEEN 2 AND 4 subtopics -- 4 is the HARD MAXIMUM,
  never 5 or more, no exceptions. If you can think of more than 4 genuinely
  distinct sub-areas, pick only the 4 most interview-worthy and drop the rest.
  Before answering, count each skill's subtopics and cut any that exceed 4.
  Subtopics must be genuinely distinct sub-areas of that skill -- for
  "Python": Variables, Strings, Arrays, Debugging, OOP Concepts (pick at most
  4 of these) -- not vague labels like "Basics".
- Keep the total subtopic count reasonable across all skills combined --
  the final question set will only be 15-20 questions total, so do not
  over-decompose.
- Return strict JSON only:
  {"skills": [{"skill": "Skill Name", "subtopics": ["Subtopic 1", "Subtopic 2"]}]}
  -- each "subtopics" array must have length 2, 3, or 4. Never 5 or more.`;

function parseSkillSubtopics(raw: unknown, expectedSkills: string[]): SkillSubtopics[] {
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as any).skills)) {
        throw new LLMCallError("Subtopic decomposition response missing a 'skills' array");
    }
    const entries = (raw as any).skills;
    const bySkill = new Map<string, SkillSubtopics>();
    for (const entry of entries) {
        if (!entry || typeof entry.skill !== "string" || !Array.isArray(entry.subtopics)) {
            throw new LLMCallError("Subtopic decomposition entry missing 'skill' or 'subtopics'");
        }
        const subtopics = entry.subtopics
            .filter((s: unknown) => typeof s === "string" && s.trim().length > 0)
            .map((s: string) => s.trim());
        if (subtopics.length < 2 || subtopics.length > 4) {
            throw new LLMCallError(
                `Skill "${entry.skill}" has ${subtopics.length} subtopics, expected 2-4`
            );
        }
        bySkill.set(entry.skill.trim(), { skill: entry.skill.trim(), subtopics });
    }
    const result: SkillSubtopics[] = [];
    for (const skill of expectedSkills) {
        const match = bySkill.get(skill);
        if (!match) {
            throw new LLMCallError(`Subtopic decomposition is missing skill "${skill}"`);
        }
        result.push(match);
    }
    return result;
}

const MAX_RETRIES = 2;

/**
 * Call B: subtopic decomposition. One consolidated call across all skills
 * (not per-skill). Retries up to MAX_RETRIES times only on malformed/wrong-
 * shape JSON.
 */
export async function decomposeSubtopics(
    jdText: string,
    skills: ExtractedSkill[],
    model: string
): Promise<{ skillSubtopics: SkillSubtopics[] }> {
    const skillNames = skills.map((s) => s.skill);
    const skillsList = skillNames.join(", ");
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await chatJSON({
                model,
                systemPrompt: SYSTEM_PROMPT_TEMPLATE(jdText, skillsList),
                userPrompt: "Produce the subtopic decomposition now, following the rules exactly.",
                maxTokens: 2000,
            });
            const skillSubtopics = parseSkillSubtopics(result.data, skillNames);
            return { skillSubtopics };
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError instanceof Error ? lastError : new LLMCallError("Subtopic decomposition failed after retries");
}
