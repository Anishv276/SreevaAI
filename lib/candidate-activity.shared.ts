export type CandidateActivityType =
    | "resume_screened"
    | "status_changed"
    | "email_sent"
    | "interview_invite_sent"
    | "interview_link_resent"
    | "bulk_action";

export interface CandidateActivityEvent {
    type: CandidateActivityType;
    label: string;
    details?: string;
    timestamp: string;
    source?: "system" | "hr" | "worker";
}

function parseJsonObject(value: unknown): Record<string, any> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, any>;
    }
    if (typeof value !== "string" || !value.trim()) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

export function normalizeAuditTrail(value: unknown): CandidateActivityEvent[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry: any) => ({
            type: String(entry?.type || "bulk_action") as CandidateActivityType,
            label: String(entry?.label || entry?.action || "").trim(),
            details: String(entry?.details || "").trim() || undefined,
            timestamp: String(entry?.timestamp || entry?.createdAt || new Date().toISOString()),
            source: entry?.source === "hr" || entry?.source === "worker" ? entry.source : "system",
        }))
        .filter((entry) => Boolean(entry.label) && Boolean(entry.timestamp));
}

export function getAuditTrailFromAiReport(aiReport: unknown): CandidateActivityEvent[] {
    const parsed = parseJsonObject(aiReport);
    return normalizeAuditTrail(parsed.auditTrail);
}
