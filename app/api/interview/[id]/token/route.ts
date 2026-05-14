import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInterviewReopenAllowed, isInterviewTokenRequired } from "@/lib/interview-access";
import { FIXED_INTERVIEW_DURATION_MINUTES } from "@/lib/drive-limits";

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
                if (!apiKey || !apiSecret || !rawUrl) return;

                // Strip any WebSocket or HTTP prefix and force HTTPS for the server SDK
                const host = `https://${rawUrl.trim().replace(/^(wss?|https?):\/\//, "")}`;

                const roomClient = new RoomServiceClient(host, apiKey, apiSecret);
                const dispatchClient = new AgentDispatchClient(host, apiKey, apiSecret);

                try {
                    await roomClient.createRoom({
                        name: roomName,
                        emptyTimeout: 10 * 60,
                        departureTimeout: 60,
                    });
                } catch (roomErr) {
                    const msg = roomErr instanceof Error ? roomErr.message.toLowerCase() : "";
                    if (!msg.includes("already exists")) {
                        console.warn("Interview room warmup warning:", roomErr);
                    }
                }

                try {
                    await dispatchClient.createDispatch(roomName, agentName, {
                        metadata: JSON.stringify({
                            applicationId,
                            candidateName: application.fullName,
                            roleLabel: application.drive?.role || application.drive?.title || "Interview",
                            timeLimitMins: FIXED_INTERVIEW_DURATION_MINUTES,
                        }),
                    });
                } catch (dispatchErr) {
                    const msg = dispatchErr instanceof Error ? dispatchErr.message.toLowerCase() : "";
                    if (!msg.includes("already") && !msg.includes("exists")) {
                        console.warn("Interview dispatch warning:", dispatchErr);
                    }
                }
            } catch (warmupErr) {
                console.warn("Interview warmup warning:", warmupErr);
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
