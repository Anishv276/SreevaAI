import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

interface ProctoringEvent {
    eventType: string;
    severity?: string;
    reason?: string;
    durationSeconds?: number;
    metadata?: Record<string, unknown>;
    timestamp?: number;
}

// Map raw eventType strings to our display categories
const EVENT_MAP: Record<string, string> = {
    FACE_NOT_DETECTED:  "face_not_detected",
    face_not_detected:  "face_not_detected",
    faceNotDetected:    "face_not_detected",
    MULTIPLE_FACES:     "multiple_faces",
    multiple_faces:     "multiple_faces",
    multipleFaces:      "multiple_faces",
    AUDIO_FLAG:         "audio_flag",
    audio_flag:         "audio_flag",
    audioFlag:          "audio_flag",
    DUPLICATE_IP:       "duplicate_ip",
    duplicate_ip:       "duplicate_ip",
    duplicateIp:        "duplicate_ip",
    tab_switch:         "tab_switch",
    tabSwitch:          "tab_switch",
};

function getRangeStart(range: string, from?: string, to?: string): Date {
    const now = new Date();
    if (range === "all") return new Date(0);
    if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === "week") {
        const d = new Date(now);
        d.setDate(now.getDate() - now.getDay());
        d.setHours(0, 0, 0, 0);
        return d;
    }
    if (range === "custom" && from) return new Date(from);
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const orgId = session.orgId;
        const { searchParams } = new URL(req.url);
        const range = searchParams.get("range") ?? "month";
        const from = searchParams.get("from") ?? undefined;
        const to = searchParams.get("to") ?? undefined;
        const start = getRangeStart(range, from, to);

        // Fetch completed interviews in range, with proctoringEvents
        let interviews: { id: string; proctoringEvents: unknown; applicationId: string }[] = [];
        try {
            interviews = await (prisma.interview as any).findMany({
                where: {
                    status: "COMPLETED",
                    completedAt: { gte: start },
                    application: { drive: { orgId } },
                },
                select: {
                    id: true,
                    applicationId: true,
                    proctoringEvents: true,
                },
            });
        } catch {
            // proctoringEvents column may not exist yet — return zeros
            const total = await prisma.interview.count({
                where: { status: "COMPLETED", completedAt: { gte: start }, application: { drive: { orgId } } },
            });
            return NextResponse.json({
                total,
                flagged: 0,
                clean: total,
                lowRisk: 0,
                review: 0,
                integrityScore: 100,
                violations: [],
            });
        }

        const total = interviews.length;

        // Counters per violation type
        const violationCounts: Record<string, { incidents: number; candidateIds: Set<string>; durations: number[] }> = {};

        let flaggedSet = new Set<string>();   // interview IDs with HIGH severity events
        let lowRiskSet = new Set<string>();   // interview IDs with LOW/MEDIUM severity

        for (const iv of interviews) {
            const raw = iv.proctoringEvents;
            if (!raw) continue;

            let events: ProctoringEvent[] = [];
            try {
                events = Array.isArray(raw) ? raw : JSON.parse(raw as string);
            } catch {
                continue;
            }

            let hasHighSeverity = false;
            let hasAnySeverity = false;

            for (const ev of events) {
                const category = EVENT_MAP[ev.eventType] ?? ev.eventType;
                if (!violationCounts[category]) {
                    violationCounts[category] = { incidents: 0, candidateIds: new Set(), durations: [] };
                }
                violationCounts[category].incidents++;
                violationCounts[category].candidateIds.add(iv.applicationId);
                if (ev.durationSeconds) violationCounts[category].durations.push(ev.durationSeconds);

                hasAnySeverity = true;
                if (ev.severity === "HIGH" || ev.severity === "high") {
                    hasHighSeverity = true;
                }
            }

            if (hasHighSeverity) flaggedSet.add(iv.id);
            else if (hasAnySeverity) lowRiskSet.add(iv.id);
        }

        const flagged = flaggedSet.size;
        const lowRisk = lowRiskSet.size;
        const review = flagged; // flagged sessions need review
        const clean = total - flagged - lowRisk;
        const integrityScore = total > 0 ? Math.round(((clean + lowRisk * 0.5) / total) * 100) : 100;

        // Build ordered violation list
        const ORDER = ["face_not_detected", "multiple_faces", "tab_switch", "fullscreen_exit", "audio_flag", "duplicate_ip"];
        const LABELS: Record<string, { title: string; abbr: string; getDesc: (v: typeof violationCounts[string]) => string }> = {
            face_not_detected: { title: "Face not detected",          abbr: "FD", getDesc: v => {
                const avgDur = v.durations.length ? Math.round(v.durations.reduce((a, b) => a + b, 0) / v.durations.length) : 0;
                return `${v.incidents} events${avgDur ? `, avg ${avgDur}s absence` : ""}`;
            }},
            tab_switch:        { title: "Tab switching / App switching", abbr: "TS", getDesc: v => `${v.incidents} switch events recorded` },
            fullscreen_exit:   { title: "Fullscreen Exit",            abbr: "FE", getDesc: v => `${v.incidents} exits detected` },
            audio_flag:        { title: "Background audio flags",     abbr: "AU", getDesc: v => `${v.incidents} voice detections` },
            duplicate_ip:      { title: "Duplicate IP / location flags", abbr: "IP", getDesc: v => `${v.incidents} pairs flagged for collusion check` },
        };

        const violations = ORDER
            .filter(k => violationCounts[k])
            .map(k => ({
                key: k,
                abbr: LABELS[k].abbr,
                title: LABELS[k].title,
                description: LABELS[k].getDesc(violationCounts[k]),
                count: violationCounts[k].incidents,
                severity: k === "audio_flag" || k === "face_not_detected" ? "medium" : "low",
            }));

        // Add zero-count rows for all standard types so UI always shows them
        for (const k of ORDER) {
            if (!violationCounts[k]) {
                violations.push({
                    key: k,
                    abbr: LABELS[k].abbr,
                    title: LABELS[k].title,
                    description: "No incidents detected",
                    count: 0,
                    severity: k === "audio_flag" || k === "face_not_detected" ? "medium" : "low",
                });
            }
        }

        violations.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

        return NextResponse.json({
            total,
            flagged,
            clean: Math.max(0, clean),
            lowRisk,
            review,
            integrityScore,
            violations,
        });
    } catch (error: any) {
        console.error("Integrity API error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
