export interface ScreeningCriteria {
    skills?: {
        mustHave?: Array<{ name: string; weight?: number }>;
        optional?: Array<{ name: string; weight?: number }>;
        // Backward compatibility for older saved jobs.
        required?: Array<{ name: string; weight?: number }>;
        niceToHave?: Array<{ name: string; weight?: number }>;
    };
    customChecks?: Array<{ text: string; required?: boolean }>;
    // Backward compatibility for older saved jobs.
    evaluationInstructions?: string;
}
export interface JobScreeningSettings {
    threshold: number;
    criteria: ScreeningCriteria;
}
function isPlainObject(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function parseMaybeJson(value: unknown): Record<string, any> {
    if (isPlainObject(value)) return value;
    if (typeof value !== "string") return {};
    try {
        const parsed = JSON.parse(value);
        return isPlainObject(parsed) ? parsed : {};
    } catch {
        return {};
    }
}
function normalizeSkills(input: unknown) {
    const skills = isPlainObject(input) ? input : {};
    const mustHave = Array.isArray(skills.mustHave) ? skills.mustHave : Array.isArray(skills.required) ? skills.required : [];
    const optional = Array.isArray(skills.optional) ? skills.optional : Array.isArray(skills.niceToHave) ? skills.niceToHave : [];
    return {
        mustHave: mustHave
            .map((item: any) => ({
                name: String(item?.name || item?.skill || "").trim(),
                weight: typeof item?.weight === "number" ? item.weight : undefined,
            }))
            .filter((item) => item.name),
        optional: optional
            .map((item: any) => ({
                name: String(item?.name || item?.skill || "").trim(),
                weight: typeof item?.weight === "number" ? item.weight : undefined,
            }))
            .filter((item) => item.name),
    };
}
function normalizeCustomChecks(input: unknown) {
    if (!Array.isArray(input)) return [];
    return input
        .map((item: any) => ({
            text: String(item?.text || item?.label || "").trim(),
            required: Boolean(item?.required),
        }))
        .filter((item) => item.text);
}
function unwrapScreeningCriteriaSource(criteria: Record<string, any>): Record<string, any> {
    // The frontend saves a wrapper object that looks like:
    // { threshold, criteria: { skills, customChecks, ... } }
    // Older records may store the raw criteria object directly.
    if (isPlainObject(criteria.criteria)) {
        return criteria.criteria;
    }
    return criteria;
}
export function sanitizeScreeningCriteria(criteria: ScreeningCriteria | Record<string, any> | null | undefined): ScreeningCriteria {
    const source = unwrapScreeningCriteriaSource(isPlainObject(criteria) ? criteria : {});
    const mustHave = normalizeSkills(source.skills).mustHave || [];
    const optional = normalizeSkills(source.skills).optional || [];
    return {
        skills: {
            mustHave,
            optional,
        },
        customChecks: normalizeCustomChecks(source.customChecks),
        evaluationInstructions: typeof source.evaluationInstructions === "string" ? source.evaluationInstructions : undefined,
    };
}
export function parseJobScreeningSettings(
    screeningCriteria: unknown,
    threshold: number
): JobScreeningSettings {
    const parsed = sanitizeScreeningCriteria(parseMaybeJson(screeningCriteria));
    return {
        threshold: Number.isFinite(threshold) ? threshold : 60,
        criteria: parsed,
    };
}
export function getRequiredSkillsText(criteria: ScreeningCriteria): string[] {
    return (criteria.skills?.mustHave || criteria.skills?.required || []).map((s) => s.name).filter(Boolean);
}
export function getNiceToHaveSkillsText(criteria: ScreeningCriteria): string[] {
    return (criteria.skills?.optional || criteria.skills?.niceToHave || []).map((s) => s.name).filter(Boolean);
}
export function getCustomChecksText(criteria: ScreeningCriteria): string[] {
    return (criteria.customChecks || []).map((item) => item.text).filter(Boolean);
}
export function criteriaToText(criteria: ScreeningCriteria): string {
    const parts: string[] = [];
    const required = getRequiredSkillsText(criteria);
    if (required.length > 0) {
        parts.push(`Must-have skills: ${required.join(", ")}`);
    }
    const niceToHave = getNiceToHaveSkillsText(criteria);
    if (niceToHave.length > 0) {
        parts.push(`Optional skills: ${niceToHave.join(", ")}`);
    }
    const customChecks = getCustomChecksText(criteria);
    if (customChecks.length > 0) {
        parts.push(`Custom checks: ${customChecks.join(", ")}`);
    }
    return parts.join(" • ");
}
