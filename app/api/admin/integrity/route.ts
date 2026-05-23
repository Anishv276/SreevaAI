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
    // Face proctoring (FaceProctoring.tsx)
    face_absence:           "face_absence",
    faceAbsence:            "face_absence",
    FACE_ABSENCE:           "face_absence",
    face_not_detected:      "face_absence",   // legacy alias
    FACE_NOT_DETECTED:      "face_absence",
    faceNotDetected:        "face_absence",
    multiple_faces:         "multiple_faces",
    multipleFaces:          "multiple_faces",
    MULTIPLE_FACES:         "multiple_faces",
    identity_mismatch:      "identity_mismatch",
    identityMismatch:       "identity_mismatch",
    IDENTITY_MISMATCH:      "identity_mismatch",
    // Network / session signals
    DUPLICATE_IP:           "duplicate_ip",
    duplicate_ip:           "duplicate_ip",
    duplicateIp:            "duplicate_ip",
    // Hardware heartbeat signals (HardwareHeartbeat.tsx)
    camera_disabled:        "camera_disabled",
    cameraDisabled:         "camera_disabled",
    CAMERA_DISABLED:        "camera_disabled",
    microphone_disabled:    "microphone_disabled",
    microphoneDisabled:     "microphone_disabled",
    MICROPHONE_DISABLED:    "microphone_disabled",
    // Connection signals (ConnectionProctoring.tsx)
    connection_lost:        "connection_lost",
    connectionLost:         "connection_lost",
    CONNECTION_LOST:        "connection_lost",
    // Browser signals
    tab_switch:             "tab_switch",
    tabSwitch:              "tab_switch",
    // Metadata-only - never a violation
    ip_registered:          "__skip__",
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

        // Fetch completed interviews in range, with integritySignals
        let interviews: { id: string; integritySignals: unknown; applicationId: string }[] = [];
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
                    integritySignals: true,
                },
            });
        } catch {
            // integritySignals column may not exist yet - return zeros
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
        // duplicate_ip is split into three sub-types sourced from event metadata
        const violationCounts: Record<string, { incidents: number; candidateIds: Set<string>; durations: number[]; highCount: number }> = {};

        const flaggedSet = new Set<string>();   // interview IDs with HIGH severity events
        const lowRiskSet = new Set<string>();   // interview IDs with LOW/MEDIUM severity

        for (const iv of interviews) {
            const raw = iv.integritySignals;
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
                const baseCategory = EVENT_MAP[ev.eventType] ?? ev.eventType;
                // Skip metadata-only events (ip_registered = fingerprint bookkeeping)
                if (baseCategory === "__skip__") continue;

                // For duplicate_ip, map to sub-tier category based on stored collisionType
                let category = baseCategory;
                if (baseCategory === "duplicate_ip") {
                    const ct = (ev.metadata as any)?.collisionType as string | undefined;
                    if (ct === "simultaneous_device_match") {
                        category = "duplicate_ip_simultaneous";
                    } else if (ct === "sequential_device_reuse") {
                        category = "duplicate_ip_sequential";
                    } else {
                        // shared_network_only or legacy events without collisionType
                        category = "duplicate_ip_network";
                    }
                }

                if (!violationCounts[category]) {
                    violationCounts[category] = { incidents: 0, candidateIds: new Set(), durations: [], highCount: 0 };
                }
                violationCounts[category].incidents++;
                violationCounts[category].candidateIds.add(iv.applicationId);
                if (ev.durationSeconds) violationCounts[category].durations.push(ev.durationSeconds);

                // Use the actual severity stored on the event (not a hard-coded guess)
                const sev = (ev.severity ?? "").toLowerCase();
                if (sev === "high") {
                    violationCounts[category].highCount++;
                    hasHighSeverity = true;
                    hasAnySeverity  = true;
                } else if (sev === "medium" || sev === "low") {
                    hasAnySeverity = true;
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

        const ORDER = [
            "face_absence",
            "multiple_faces",
            "identity_mismatch",
            "camera_disabled",
            "microphone_disabled",
            "tab_switch",
            // Smart Collusion Detection - three tiers
            "duplicate_ip_simultaneous",
            "duplicate_ip_sequential",
            "duplicate_ip_network",
            "connection_lost",
        ];
        const LABELS: Record<string, { title: string; abbr: string; getDesc: (v: typeof violationCounts[string]) => string }> = {
            face_absence:               { title: "Face not visible",                   abbr: "FA", getDesc: v => {
                const avgDur = v.durations.length ? Math.round(v.durations.reduce((a, b) => a + b, 0) / v.durations.length) : 0;
                return `${v.incidents} events${avgDur ? `, avg ${avgDur}s absence` : ""}`;
            }},
            multiple_faces:             { title: "Multiple faces detected",             abbr: "MF", getDesc: v => `${v.incidents} incidents flagged` },
            identity_mismatch:          { title: "Identity mismatch",                   abbr: "IM", getDesc: v => `${v.incidents} mismatch checks triggered` },
            camera_disabled:            { title: "Camera disabled mid-session",          abbr: "CD", getDesc: v => `${v.incidents} camera disable events` },
            microphone_disabled:        { title: "Microphone disabled mid-session",      abbr: "MD", getDesc: v => `${v.incidents} mic disable events` },
            tab_switch:                 { title: "Tab switching / App switching",       abbr: "TS", getDesc: v => `${v.incidents} switch events recorded` },
            // Smart Collusion - 3 tiers
            duplicate_ip_simultaneous:  { title: "🔴 Simultaneous Device Match",        abbr: "SC", getDesc: v => `${v.incidents} HIGH-risk: same device, same time` },
            duplicate_ip_sequential:    { title: "🟡 Sequential Device Reuse",           abbr: "SR", getDesc: v => `${v.incidents} MEDIUM-risk: same device, different session` },
            duplicate_ip_network:       { title: "🟢 Shared Network Only",               abbr: "SN", getDesc: v => `${v.incidents} LOW-risk: campus/office shared IP` },
            connection_lost:            { title: "Connection drops",                   abbr: "CL", getDesc: v => `${v.incidents} connection loss events` },
        };

        // Severity determination per category using event data
        const HIGH_SEVERITY_KEYS   = new Set(["face_absence", "multiple_faces", "identity_mismatch", "camera_disabled", "duplicate_ip_simultaneous"]);
        const MEDIUM_SEVERITY_KEYS = new Set(["tab_switch", "microphone_disabled", "connection_lost", "duplicate_ip_sequential"]);

        const violations = ORDER
            .filter((k: string) => violationCounts[k as keyof typeof violationCounts] && LABELS[k as keyof typeof LABELS])
            .map((k: string) => ({
                key: k,
                abbr: LABELS[k as keyof typeof LABELS].abbr,
                title: LABELS[k as keyof typeof LABELS].title,
                description: LABELS[k as keyof typeof LABELS].getDesc(violationCounts[k as keyof typeof violationCounts]),
                count: violationCounts[k as keyof typeof violationCounts].incidents,
                severity: HIGH_SEVERITY_KEYS.has(k) ? "high"
                        : MEDIUM_SEVERITY_KEYS.has(k) ? "medium"
                        : "low",
            }));

        // Add zero-count rows for all standard types so UI always shows them
        for (const k of ORDER) {
            if (!violationCounts[k] && LABELS[k]) {
                violations.push({
                    key: k,
                    abbr: LABELS[k].abbr,
                    title: LABELS[k].title,
                    description: "No incidents detected",
                    count: 0,
                    severity: HIGH_SEVERITY_KEYS.has(k) ? "high"
                            : MEDIUM_SEVERITY_KEYS.has(k) ? "medium"
                            : "low",
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
