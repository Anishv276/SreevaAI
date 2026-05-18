import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInterviewReopenAllowed, isInterviewTokenRequired } from "@/lib/interview-access";
import { FIXED_INTERVIEW_DURATION_MINUTES } from "@/lib/drive-limits";
import crypto from "crypto";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: applicationId } = await params;
        const { token: interviewToken } = await request.json();
        const requireInterviewToken = isInterviewTokenRequired();
        const allowReopen = isInterviewReopenAllowed();

        if (!applicationId || (requireInterviewToken && !interviewToken)) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const interview = await prisma.interview.findFirst({
            where: {
                applicationId,
                accessToken: interviewToken,
            },
        });

        if (requireInterviewToken && !interview) {
            return NextResponse.json({ error: "Invalid interview token" }, { status: 401 });
        }

        // -- LIFECYCLE CHECK ------------------------------
        if (!allowReopen && (interview?.status === "COMPLETED" || interview?.status === "FAILED")) {
            return NextResponse.json({ error: "Access Denied: Interview already finalized" }, { status: 403 });
        }

        // If interview is IN_PROGRESS, allow rejoin only if they were in for less than 5 minutes.
        // This lets candidates retry if they had a connection drop before the interview really started.
        const REJOIN_GRACE_MINUTES = 5;
        if (!allowReopen && interview?.status === "IN_PROGRESS" && interview?.startedAt) {
            const elapsedMs = Date.now() - new Date(interview.startedAt).getTime();
            const elapsedMinutes = elapsedMs / 60000;
            if (elapsedMinutes >= REJOIN_GRACE_MINUTES) {
                return NextResponse.json({
                    error: "Access Denied: Interview already in progress. You cannot rejoin after 5 minutes.",
                }, { status: 403 });
            }
            // Under 5 minutes — reset to PENDING so they get a clean session
            try {
                await prisma.interview.update({
                    where: { applicationId },
                    data: { status: "PENDING", startedAt: null },
                });
                console.log(`[TOKEN] Rejoin allowed for ${applicationId} — elapsed ${Math.round(elapsedMinutes * 10) / 10}min < ${REJOIN_GRACE_MINUTES}min, reset to PENDING`);
            } catch (resetErr) {
                console.warn("[TOKEN_API] Failed to reset interview status:", resetErr);
            }
        }

        if (interview?.expiresAt && interview.expiresAt < new Date()) {
            return NextResponse.json({ error: "Access Denied: Interview session has expired" }, { status: 403 });
        }

        /* 
        // Enforce exact start time based on slot schedule (Temporarily disabled for testing)
        if (interview?.scheduledAt) {
            const now = Date.now();
            const slotStart = interview.scheduledAt.getTime();
            const slotEnd = slotStart + 20 * 60000;

            if (now < slotStart) {
                return NextResponse.json({ error: `Access Denied: Your interview slot opens at ${new Date(slotStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` }, { status: 403 });
            }
            if (now > slotEnd && !interview.startedAt) {
                return NextResponse.json({ error: "Access Denied: You missed your selected interview slot. Please contact HR to reschedule." }, { status: 403 });
            }
            if (now > slotEnd) {
                return NextResponse.json({ error: "Access Denied: Your interview slot has ended." }, { status: 403 });
            }
        }
        */
        // -------------------------------------------------

        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: {
                drive: {
                    select: {
                        role: true,
                        title: true,
                    },
                },
            },
        });

        if (!application) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
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
                    console.error("[TOKEN] Missing LiveKit env vars — dispatch skipped");
                    return;
                }

                // Strip any WebSocket or HTTP prefix and force HTTPS for the server SDK
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

                // Cancel any existing pending dispatches for this room before creating a new one.
                try {
                    const existing = await dispatchClient.listDispatch(roomName);
                    for (const d of existing) {
                        await dispatchClient.deleteDispatch(d.id, roomName).catch(() => {});
                    }
                    if (existing.length > 0) {
                        console.log(`[TOKEN] Cleared ${existing.length} stale dispatch(es) for room "${roomName}"`);
                    }
                } catch { /* ignore if room doesn't exist yet */ }

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

        // -- STATUS UPDATE: Interview is now in progress ----------
        try {
            await prisma.application.update({
                where: { id: applicationId },
                data: { interviewStatus: "in progress" }
            });
            await prisma.interview.upsert({
                where: { applicationId },
                update: { status: "IN_PROGRESS", startedAt: new Date() },
                create: {
                    id: crypto.randomUUID(),
                    applicationId,
                    accessToken: interviewToken || crypto.randomUUID(),
                    status: "IN_PROGRESS",
                    startedAt: new Date(),
                },
            });
        } catch (statusErr) {
            console.warn("[TOKEN_API] Failed to update interview status to in progress:", statusErr);
        }
        // ---------------------------------------------------------

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
