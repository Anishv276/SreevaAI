import { prisma } from "@/lib/prisma";
import {
    CandidateActivityEvent,
    getAuditTrailFromAiReport,
    normalizeAuditTrail,
} from "@/lib/candidate-activity.shared";
export type { CandidateActivityEvent };
export { getAuditTrailFromAiReport, normalizeAuditTrail };
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
export async function appendCandidateActivity(
    applicationId: string,
    event: CandidateActivityEvent
) {
    const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { aiReport: true },
    });
    if (!application) return;
    const parsed = parseJsonObject(application.aiReport);
    const auditTrail = normalizeAuditTrail(parsed.auditTrail);
    auditTrail.push({
        ...event,
        timestamp: event.timestamp || new Date().toISOString(),
    });
    parsed.auditTrail = auditTrail.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    await prisma.application.update({
        where: { id: applicationId },
        data: { aiReport: JSON.stringify(parsed) },
    });
}
