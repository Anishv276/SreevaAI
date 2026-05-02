export interface ScreeningCriteria {
    skills?: {
        required?: Array<{ name: string; weight?: number }>;
        niceToHave?: Array<{ name: string; weight?: number }>;
    };
    customChecks?: Array<{ text: string; required?: boolean }>;
    // Backward compatibility for older saved drives.
    experience?: {
        minimumYears?: number;
        seniorityLevel?: "junior" | "mid" | "senior";
        preferredDomain?: string;
    };
    education?: {
        degreeLevel?: "high_school" | "bachelor" | "master" | "phd";
        fieldOfStudy?: string[];
        requiredCertifications?: string[];
        niceToHaveCertifications?: string[];
    };
    location?: {
        required?: string[];
        workPermitRequired?: boolean;
        remoteOk?: boolean;
    };
}

export interface DriveScreeningSettings {
    threshold: number;
    inviteScheduleDays: number;
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
    const required = Array.isArray(skills.required) ? skills.required : [];
    const niceToHave = Array.isArray(skills.niceToHave) ? skills.niceToHave : [];
    return {
        required: required
            .map((item: any) => ({
                name: String(item?.name || item?.skill || "").trim(),
                weight: typeof item?.weight === "number" ? item.weight : undefined,
            }))
            .filter((item) => item.name),
        niceToHave: niceToHave
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

export function sanitizeScreeningCriteria(criteria: ScreeningCriteria | Record<string, any> | null | undefined): ScreeningCriteria {
    const source = isPlainObject(criteria) ? criteria : {};
    return {
        skills: normalizeSkills(source.skills),
        customChecks: normalizeCustomChecks(source.customChecks),
    };
}

export function parseDriveScreeningSettings(
    screeningCriteria: unknown,
    threshold: number,
    inviteScheduleDays: number
): DriveScreeningSettings {
    const parsed = sanitizeScreeningCriteria(parseMaybeJson(screeningCriteria));
    return {
        threshold: Number.isFinite(threshold) ? threshold : 60,
        inviteScheduleDays: Number.isFinite(inviteScheduleDays) && inviteScheduleDays > 0 ? inviteScheduleDays : 1,
        criteria: parsed,
    };
}

export function getRequiredSkillsText(criteria: ScreeningCriteria): string[] {
    return (criteria.skills?.required || []).map((s) => s.name).filter(Boolean);
}

export function getNiceToHaveSkillsText(criteria: ScreeningCriteria): string[] {
    return (criteria.skills?.niceToHave || []).map((s) => s.name).filter(Boolean);
}

export function getCustomChecksText(criteria: ScreeningCriteria): string[] {
    return (criteria.customChecks || []).map((item) => item.text).filter(Boolean);
}

export function criteriaToText(criteria: ScreeningCriteria): string {
    const parts: string[] = [];

    const required = getRequiredSkillsText(criteria);
    if (required.length > 0) {
        parts.push(`Required skills: ${required.join(", ")}`);
    }

    const niceToHave = getNiceToHaveSkillsText(criteria);
    if (niceToHave.length > 0) {
        parts.push(`Nice to have: ${niceToHave.join(", ")}`);
    }

    const customChecks = getCustomChecksText(criteria);
    if (customChecks.length > 0) {
        parts.push(`Custom checks: ${customChecks.join(", ")}`);
    }

    return parts.join(" • ");
}
