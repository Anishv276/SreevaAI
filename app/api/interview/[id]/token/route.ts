import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import {
    FIXED_INTERVIEW_DURATION_MINUTES,
} from "@/lib/drive-limits";
import { normalizeProctoringSignals } from "@/lib/proctoring-signals";

const JOIN_WINDOW_MS = 5 * 60 * 1000;

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const prismaAny = prisma as any;
        const { id: applicationId } = await params;
        const { token: interviewToken } = await request.json();
        const requireInterviewToken = isInterviewTokenRequired();
        if (!applicationId || (requireInterviewToken && !interviewToken)) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const application = await prismaAny.application.findUnique({
            where: { id: applicationId },
            include: {
                drive: {
                    include: {
                        organization: {
                            select: { proctoringSignals: true },
                        },
                    },
                },
                interview: true,
            },
        });

        if (!application) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }

        const interview = application.interview;

        if (!interview) {
            return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
        }

        if (requireInterviewToken && interview.accessToken !== interviewToken) {
            return NextResponse.json({ error: "Invalid interview token" }, { status: 401 });
        }

        {
            const now = Date.now();
            const expiresAtMs = interview.expiresAt ? interview.expiresAt.getTime() : null;
            const startedAtMs = interview.startedAt ? interview.startedAt.getTime() : null;
            const interviewStatus = String(interview.status || "").toUpperCase();
            const isAlreadyDone = interviewStatus === "COMPLETED" || interviewStatus === "NO_SHOW";
            if (isAlreadyDone) {
                return NextResponse.json({
                    error: "Interview has been completed.",
                    code: "INTERVIEW_COMPLETED",
                }, { status: 409 });
            }

            const deadlineExpired = expiresAtMs !== null && now > expiresAtMs;
            // joinWindow only blocks if interview is CURRENTLY in progress — not if it was
            // completed/no-show days ago. An old startedAt on a finished interview must not
            // permanently lock the candidate out of re-attempting after an admin reset.
            const joinWindowExpired = startedAtMs !== null && (now - startedAtMs) >= JOIN_WINDOW_MS;
            const isExpiredByTime = deadlineExpired || joinWindowExpired;

            // Reset EXPIRED linkStatus if the interview was already done (completed/no-show)
            // and the deadline hasn't actually passed — this lets admins re-send links.
            if (interview.linkStatus === "EXPIRED" && isAlreadyDone && !deadlineExpired) {
                await prismaAny.interview.update({
                    where: { applicationId },
                    data: { linkStatus: "ACTIVE", startedAt: null },
                }).catch(() => { });
                // Allow access — fall through to token generation
            } else {
                if (isExpiredByTime && interview.linkStatus !== "EXPIRED") {
                    await prismaAny.interview.update({
                        where: { applicationId },
                        data: { linkStatus: "EXPIRED" },
                    }).catch(() => { });
                }

                if (interview.linkStatus === "EXPIRED" || isExpiredByTime) {
                    if (deadlineExpired) {
                        return NextResponse.json({
                            error: "This job posting has closed. Applications are no longer being accepted.",
                            code: "DRIVE_CLOSED",
                        }, { status: 403 });
                    }
                    return NextResponse.json({
                        error: "Access Denied: Interview link has expired. Please contact support.",
                        code: "LINK_EXPIRED",
                    }, { status: 403 });
                }
            }
        }

        const roomName = `interview_${applicationId}`;
        const participantIdentity = `candidate_${applicationId}`;
        const durationSeconds = Math.floor(FIXED_INTERVIEW_DURATION_MINUTES * 60);
        const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;
        const agentName = process.env.LIVEKIT_AGENT_NAME || "ai_interviewer";

        // Best-effort warmup. We do not block token issuance on worker/room prep.
        void (async () => {
            try {
                const apiKey = process.env.LIVEKIT_API_KEY;
                const apiSecret = process.env.LIVEKIT_API_SECRET;
                const rawUrl = process.env.LIVEKIT_URL;
                if (!apiKey || !apiSecret || !rawUrl) {
                    console.error("[TOKEN] Missing LiveKit env vars - dispatch skipped");
                    return;
                }

                // Strip any WebSocket or HTTP prefix and force HTTPS for the server SDK.
                const host = `https://${rawUrl.trim().replace(/^(wss?|https?):\/\//, "")}`;
                console.log(`[TOKEN] Dispatching agent "${agentName}" to room "${roomName}" via ${host}`);

                const roomClient = new RoomServiceClient(host, apiKey, apiSecret);
                const dispatchClient = new AgentDispatchClient(host, apiKey, apiSecret);

                try {
                    await roomClient.createRoom({
                        name: roomName,
                        emptyTimeout: 10 * 60,
                        departureTimeout: 60,
                    });
                    console.log(`[TOKEN] Room "${roomName}" created/verified`);
                } catch (roomErr) {
                    const msg = roomErr instanceof Error ? roomErr.message.toLowerCase() : "";
                    if (!msg.includes("already exists")) {
                        console.error("[TOKEN] Room creation failed:", roomErr);
                    }
                }

                // Cancel stale dispatches for this room before creating a new one.
                try {
                    const existing = await dispatchClient.listDispatch(roomName);
                    for (const d of existing) {
                        await dispatchClient.deleteDispatch(d.id, roomName).catch(() => {});
                    }
                    if (existing.length > 0) {
                        console.log(`[TOKEN] Cleared ${existing.length} stale dispatch(es) for room "${roomName}"`);
                    }
                } catch {
                    // Ignore if room does not exist yet.
                }

                try {
                    const dispatch = await dispatchClient.createDispatch(roomName, agentName, {
                        metadata: JSON.stringify({
                            applicationId,
                            candidateName: application.fullName,
                            roleLabel: application.drive?.role || application.drive?.title || "Interview",
                            timeLimitMins: FIXED_INTERVIEW_DURATION_MINUTES,
                        }),
                    });
                    console.log(`[TOKEN] Agent dispatch created: id=${dispatch.id} agent=${dispatch.agentName} room=${dispatch.room}`);
                } catch (dispatchErr) {
                    console.error("[TOKEN] Agent dispatch FAILED:", dispatchErr);
                }
            } catch (warmupErr) {
                console.error("[TOKEN] Warmup error:", warmupErr);
            }
        })();

        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            {
                identity: participantIdentity,
                ttl: "2h",
            }
        );

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canPublishData: true,
            canSubscribe: true,
        });

        const proctoringSignals = normalizeProctoringSignals(
            application.drive?.organization?.proctoringSignals
        );

        return NextResponse.json({
            token: await at.toJwt(),
            url: serverUrl,
            duration: durationSeconds,
            roleLabel: application.drive?.role || application.drive?.title || "Interview",
            candidateName: application.fullName,
            proctoringSignals,
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
        const prismaAny = prisma as any;
        const { id: applicationId } = await params;
        const url = new URL(request.url);
        const interviewToken = url.searchParams.get("token") || "";
        const requireInterviewToken = isInterviewTokenRequired();

        if (!applicationId || (requireInterviewToken && !interviewToken)) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const application = await prismaAny.application.findUnique({
            where: { id: applicationId },
            include: { interview: true },
        });

        if (!application || !application.interview) {
            return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
        }

        const interview = application.interview;

        if (requireInterviewToken && interview.accessToken !== interviewToken) {
            return NextResponse.json({ error: "Invalid interview token" }, { status: 401 });
        }

        const now = Date.now();
        const expiresAtMs = interview.expiresAt ? interview.expiresAt.getTime() : null;
        const startedAtMs = interview.startedAt ? interview.startedAt.getTime() : null;
        const interviewStatus = String(interview.status || "").toUpperCase();
        const isAlreadyDone = interviewStatus === "COMPLETED" || interviewStatus === "NO_SHOW";
        
        if (isAlreadyDone) {
            return NextResponse.json({ error: "Interview has been completed.", code: "INTERVIEW_COMPLETED" }, { status: 409 });
        }

        const deadlineExpired = expiresAtMs !== null && now > expiresAtMs;
        const joinWindowExpired = startedAtMs !== null && (now - startedAtMs) >= JOIN_WINDOW_MS;
        const isExpiredByTime = deadlineExpired || joinWindowExpired;

        if (interview.linkStatus === "EXPIRED" || isExpiredByTime) {
            if (deadlineExpired) {
                return NextResponse.json({ error: "This job posting has closed. Applications are no longer being accepted.", code: "DRIVE_CLOSED" }, { status: 403 });
            }
            return NextResponse.json({ error: "Access Denied: Interview link has expired. Please contact support.", code: "LINK_EXPIRED" }, { status: 403 });
        }

        return NextResponse.json({ ok: true, code: "ACTIVE" });
    } catch (error) {
        console.error("Status check error:", error);
        return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
    }
}

