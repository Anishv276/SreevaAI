import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { FIXED_INTERVIEW_DURATION_MINUTES } from "@/lib/drive-limits";
import { normalizeProctoringSignals } from "@/lib/proctoring-signals";

// Grace: candidate must join within 5 min after slot start, and can enter 5 min before
const PRE_OPEN_MS  = 5 * 60 * 1000;  // waiting room opens 5 min before slot
const LATE_CLOSE_MS = 5 * 60 * 1000; // link expires 5 min after slot start

async function resolveInterview(applicationId: string) {
    return prisma.application.findUnique({
        where: { id: applicationId },
        include: {
            drive: {
                include: {
                    organization: { select: { proctoringSignals: true } },
                },
            },
            interview: true,
        },
    });
}

function checkSchedulingGate(interview: { scheduledAt: Date | null; status: string; startedAt: Date | null }): {
    ok: boolean; code?: string; error?: string; status?: number;
} {
    const interviewStatus = String(interview.status || "").toUpperCase();

    if (interviewStatus === "COMPLETED") {
        return { ok: false, code: "INTERVIEW_COMPLETED", error: "This interview has been completed.", status: 409 };
    }

    // If in progress (another session is live), block re-entry
    if (interviewStatus === "IN_PROGRESS" && !interview.startedAt) {
        return { ok: false, code: "INTERVIEW_IN_PROGRESS", error: "Interview is currently in progress.", status: 409 };
    }

    if (!interview.scheduledAt) {
        return { ok: false, code: "NOT_SCHEDULED", error: "No slot booked yet. Please schedule your interview first.", status: 403 };
    }

    const now = Date.now();
    const slotMs = interview.scheduledAt.getTime();

    if (now < slotMs - PRE_OPEN_MS) {
        return {
            ok: false,
            code: "TOO_EARLY",
            error: "Waiting room is not open yet. Please return 5 minutes before your scheduled time.",
            status: 403,
            // ponytail: pass scheduledAt so frontend can show countdown
        };
    }

    if (now > slotMs + LATE_CLOSE_MS) {
        return {
            ok: false,
            code: "SLOT_EXPIRED",
            error: "Your slot has been expired, contact recruiter.",
            status: 403,
        };
    }

    return { ok: true };
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: applicationId } = await params;
        const { token: interviewToken } = await request.json();
        const requireToken = isInterviewTokenRequired();
        if (!applicationId || (requireToken && !interviewToken)) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const application = await resolveInterview(applicationId);
        if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
        const interview = application.interview;
        if (!interview) return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
        if (requireToken && interview.accessToken !== interviewToken) {
            return NextResponse.json({ error: "Invalid interview token" }, { status: 401 });
        }

        const gate = checkSchedulingGate(interview);
        if (!gate.ok) {
            if (gate.code === "SLOT_EXPIRED" && interview.linkStatus !== "EXPIRED") {
                await prisma.interview.update({
                    where: { applicationId },
                    data: { linkStatus: "EXPIRED" }
                }).catch(() => {});
            }
            return NextResponse.json(
                { error: gate.error, code: gate.code, scheduledAt: interview.scheduledAt?.toISOString() },
                { status: gate.status }
            );
        }

        const roomName = `interview_${applicationId}`;
        const participantIdentity = `candidate_${applicationId}`;
        const durationSeconds = Math.floor(FIXED_INTERVIEW_DURATION_MINUTES * 60);
        const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;
        const agentName = process.env.LIVEKIT_AGENT_NAME || "ai_interviewer";

        // Mark IN_PROGRESS on first token request
        if (interview.status === "PENDING") {
            await prisma.interview.update({
                where: { applicationId },
                data: { status: "IN_PROGRESS", startedAt: new Date(), linkStatus: "EXPIRED" },
            }).catch(() => {});
        }

        // Best-effort agent warmup
        void (async () => {
            try {
                const apiKey = process.env.LIVEKIT_API_KEY;
                const apiSecret = process.env.LIVEKIT_API_SECRET;
                const rawUrl = process.env.LIVEKIT_URL;
                if (!apiKey || !apiSecret || !rawUrl) return;
                const host = `https://${rawUrl.trim().replace(/^(wss?|https?):\/\//, "")}`;
                const roomClient = new RoomServiceClient(host, apiKey, apiSecret);
                const dispatchClient = new AgentDispatchClient(host, apiKey, apiSecret);
                try {
                    await roomClient.createRoom({ name: roomName, emptyTimeout: 10 * 60, departureTimeout: 60 });
                } catch (e) {
                    const msg = e instanceof Error ? e.message.toLowerCase() : "";
                    if (!msg.includes("already exists")) console.error("[TOKEN] Room creation failed:", e);
                }
                try {
                    const existing = await dispatchClient.listDispatch(roomName);
                    for (const d of existing) await dispatchClient.deleteDispatch(d.id, roomName).catch(() => {});
                } catch {}
                await dispatchClient.createDispatch(roomName, agentName, {
                    metadata: JSON.stringify({
                        applicationId,
                        candidateName: application.fullName,
                        roleLabel: application.drive?.role || application.drive?.title || "Interview",
                        timeLimitMins: FIXED_INTERVIEW_DURATION_MINUTES,
                    }),
                });
            } catch (e) {
                console.error("[TOKEN] Warmup error:", e);
            }
        })();

        const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
            identity: participantIdentity,
            ttl: "2h",
        });
        at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canPublishData: true, canSubscribe: true });

        const proctoringSignals = normalizeProctoringSignals(application.drive?.organization?.proctoringSignals);

        return NextResponse.json({
            token: await at.toJwt(),
            url: serverUrl,
            duration: durationSeconds,
            roleLabel: application.drive?.role || application.drive?.title || "Interview",
            candidateName: application.fullName,
            proctoringSignals,
            scheduledAt: interview.scheduledAt?.toISOString(),
        });
    } catch (error) {
        console.error("LiveKit token error:", error);
        return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
    }
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: applicationId } = await params;
        const url = new URL(request.url);
        const interviewToken = url.searchParams.get("token") || "";
        const requireToken = isInterviewTokenRequired();
        if (!applicationId || (requireToken && !interviewToken)) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: { interview: true },
        });
        if (!application || !application.interview) {
            return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
        }
        const interview = application.interview;
        if (requireToken && interview.accessToken !== interviewToken) {
            return NextResponse.json({ error: "Invalid interview token" }, { status: 401 });
        }

        const gate = checkSchedulingGate(interview);
        if (!gate.ok) {
            if (gate.code === "SLOT_EXPIRED" && interview.linkStatus !== "EXPIRED") {
                await prisma.interview.update({
                    where: { applicationId },
                    data: { linkStatus: "EXPIRED" }
                }).catch(() => {});
            }
            return NextResponse.json(
                { error: gate.error, code: gate.code, scheduledAt: interview.scheduledAt?.toISOString() },
                { status: gate.status }
            );
        }

        return NextResponse.json({ ok: true, code: "ACTIVE", scheduledAt: interview.scheduledAt?.toISOString() });
    } catch (error) {
        console.error("Status check error:", error);
        return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
    }
}
