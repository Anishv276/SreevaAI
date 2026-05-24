import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import {
    FIXED_INTERVIEW_DURATION_MINUTES,
} from "@/lib/drive-limits";
import crypto from "crypto";

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

        const interview = await prismaAny.interview.findUnique({
            where: { applicationId },
        });

        if (!interview) {
            return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
        }

        if (requireInterviewToken && interview.accessToken !== interviewToken) {
            return NextResponse.json({ error: "Invalid interview token" }, { status: 401 });
        }

        const application = await prismaAny.application.findUnique({
            where: { id: applicationId },
            include: {
                drive: true,
            },
        });

        if (!application) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }

        {
            const now = Date.now();
            const expiresAtMs = interview.expiresAt ? interview.expiresAt.getTime() : null;
            const startedAtMs = interview.startedAt ? interview.startedAt.getTime() : null;
            const deadlineExpired = expiresAtMs !== null && now > expiresAtMs;
            const joinWindowExpired = startedAtMs !== null && (now - startedAtMs) >= JOIN_WINDOW_MS;
            const isExpiredByTime = deadlineExpired || joinWindowExpired;

            if (isExpiredByTime && interview.linkStatus !== "EXPIRED") {
                await prismaAny.interview.update({
                    where: { applicationId },
                    data: { linkStatus: "EXPIRED" },
                }).catch(() => { });
            }

            if (interview.linkStatus === "EXPIRED" || isExpiredByTime) {
                return NextResponse.json({
                    error: "Access Denied: Interview link has expired. Please contact support.",
                    code: "LINK_EXPIRED",
                }, { status: 403 });
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

        // Mark interview status as in progress.
        try {
            await prismaAny.application.update({
                where: { id: applicationId },
                data: { interviewStatus: "in progress" },
            });
            await prismaAny.interview.upsert({
                where: { applicationId },
                update: {
                    status: "IN_PROGRESS",
                    startedAt: interview.startedAt || new Date(),
                },
                create: {
                    id: crypto.randomUUID(),
                    applicationId,
                    accessToken: interviewToken || crypto.randomUUID(),
                    status: "IN_PROGRESS",
                    startedAt: new Date(),
                    linkStatus: "ACTIVE",
                },
            });
        } catch (statusErr) {
            console.warn("[TOKEN_API] Failed to update interview status to in progress:", statusErr);
        }

        return NextResponse.json({
            token: await at.toJwt(),
            url: serverUrl,
            duration: durationSeconds,
            roleLabel: application.drive?.role || application.drive?.title || "Interview",
            candidateName: application.fullName,
        });
    } catch (error) {
        console.error("LiveKit token error:", error);
        return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
    }
}
