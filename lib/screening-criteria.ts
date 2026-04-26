export interface ScreeningCriteria {
    skills?: {
        required?: Array<{ name: string; proficiency?: string; weight?: number }>;
        niceToHave?: Array<{ name: string; weight?: number }>;
    };
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

export function parseScreeningCriteria(data: string | null | undefined): ScreeningCriteria {
    if (!data) return {};
    try {
        return JSON.parse(data);
    } catch {
        return {};
    }
}

export function stringifyScreeningCriteria(criteria: ScreeningCriteria): string {
    return JSON.stringify(criteria || {});
}

export function getRequiredSkillsText(criteria: ScreeningCriteria): string[] {
    return (criteria.skills?.required || []).map(s => s.name).filter(Boolean);
}

export function getNiceToHaveSkillsText(criteria: ScreeningCriteria): string[] {
    return (criteria.skills?.niceToHave || []).map(s => s.name).filter(Boolean);
}

export function criteriaToText(criteria: ScreeningCriteria): string {
    const parts: string[] = [];

    // Skills
    const required = getRequiredSkillsText(criteria);
    if (required.length > 0) {
        parts.push(`Required skills: ${required.join(", ")}`);
    }
    const niceToHave = getNiceToHaveSkillsText(criteria);
    if (niceToHave.length > 0) {
        parts.push(`Nice to have: ${niceToHave.join(", ")}`);
    }

    // Experience
    if (criteria.experience?.minimumYears) {
        parts.push(`${criteria.experience.minimumYears}+ years experience`);
    }
    if (criteria.experience?.seniorityLevel) {
        parts.push(`${criteria.experience.seniorityLevel} level`);
    }
    if (criteria.experience?.preferredDomain) {
        parts.push(`Domain: ${criteria.experience.preferredDomain}`);
    }

    // Education
    if (criteria.education?.degreeLevel) {
        parts.push(`${criteria.education.degreeLevel} degree`);
    }
    if (criteria.education?.fieldOfStudy && criteria.education.fieldOfStudy.length > 0) {
        parts.push(`Field: ${criteria.education.fieldOfStudy.join(", ")}`);
    }

    // Location
    if (criteria.location?.required && criteria.location.required.length > 0) {
        parts.push(`Location: ${criteria.location.required.join(", ")}`);
    }

    return parts.join(" • ");
}
