import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { interviewTokenSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const DISPATCH_DEBOUNCE_MS = 45_000;
const dispatchByRoom = new Map<string, number>();

function looksLikeAgentParticipant(participant: { identity?: string; name?: string }) {
    const identity = (participant.identity || "").toLowerCase();
    const name = (participant.name || "").toLowerCase();
    return identity.startsWith("aw_") || identity.includes("agent") || name.includes("agent");
}

function toWsUrl(rawUrl: string) {
    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://") && !rawUrl.startsWith("ws://") && !rawUrl.startsWith("wss://")) {
        return `wss://${rawUrl}`;
    }
    if (rawUrl.startsWith("http://")) return rawUrl.replace("http://", "ws://");
    if (rawUrl.startsWith("https://")) return rawUrl.replace("https://", "wss://");
    return rawUrl;
}

function toHttpUrl(rawUrl: string) {
    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://") && !rawUrl.startsWith("ws://") && !rawUrl.startsWith("wss://")) {
        return `https://${rawUrl}`;
    }
    if (rawUrl.startsWith("wss://")) return rawUrl.replace("wss://", "https://");
    if (rawUrl.startsWith("ws://")) return rawUrl.replace("ws://", "http://");
    return rawUrl;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const result = interviewTokenSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { applicationId, participantName } = result.data;

        // Fetch application to get drive details (interview duration)
        let application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: { drive: true }
        });

        if (!application) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }

        try {
            await prisma.interview.upsert({
                where: { applicationId },
                update: {},
                create: {
                    applicationId,
                    status: "PENDING",
                    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
                },
            });
        } catch (interviewSyncError) {
            console.warn("[InterviewToken] Interview row sync skipped:", interviewSyncError);
        }

        const driveDurationMins = application.drive.interviewTime || 15;
        const durationSeconds = driveDurationMins * 60;

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const rawUrl = process.env.LIVEKIT_URL;
        const agentName = process.env.LIVEKIT_AGENT_NAME || "ai_interviewer";

        if (!apiKey || !apiSecret || !rawUrl) {
            return NextResponse.json({ error: "Server configuration missing" }, { status: 500 });
        }

        const wsUrl = toWsUrl(rawUrl);
        const roomName = "interview_" + applicationId;

        try {
            const host = toHttpUrl(rawUrl);
            const roomClient = new RoomServiceClient(host, apiKey, apiSecret);
            const dispatchClient = new AgentDispatchClient(host, apiKey, apiSecret);

            try {
                const roomMetadata = JSON.stringify({
                    applicationId,
                    extractedDetails: application.drive.extractedDetails || "{}",
                    structuredResume: application.structuredResume || "{}",
                    aiReport: application.aiReport || "{}"
                });

                await roomClient.createRoom({
                    name: roomName,
                    emptyTimeout: 10 * 60,
                    departureTimeout: 60,
                    metadata: roomMetadata,
                });
            } catch (roomErr) {
                const msg = roomErr instanceof Error ? roomErr.message.toLowerCase() : "";
                if (!msg.includes("already exists")) {
                    throw roomErr;
                }
            }

            const now = Date.now();
            const lastDispatchAt = dispatchByRoom.get(roomName) || 0;
            const inDebounceWindow = now - lastDispatchAt < DISPATCH_DEBOUNCE_MS;

            if (!inDebounceWindow) {
                try {
                    await dispatchClient.createDispatch(roomName, agentName, {
                        metadata: JSON.stringify({ applicationId }),
                    });
                    dispatchByRoom.set(roomName, now);
                } catch (dispatchErr) {
                    const msg = dispatchErr instanceof Error ? dispatchErr.message.toLowerCase() : "";
                    if (!msg.includes("already") && !msg.includes("exists")) {
                        throw dispatchErr;
                    }
                }
            } else {
                console.log(
                    `[InterviewToken] Skipping duplicate agent dispatch for ${roomName} ` +
                    `(inDebounceWindow=${inDebounceWindow})`
                );
            }
        } catch (dispatchErr) {
            console.error("Agent dispatch error:", dispatchErr);
            return NextResponse.json({ error: "AI interviewer could not be started" }, { status: 500 });
        }

        // Recording is now started from the frontend when the agent's first greeting fires.
        // See /api/interview/start-recording

        // ── ISSUE CANDIDATE JWT TOKEN ──
        // TTL = interview duration + 30 min buffer, minimum 1h
        const ttlSeconds = Math.max(3600, durationSeconds + 1800);

        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantName + "_" + crypto.randomUUID().slice(0, 8),
            name: participantName,
            ttl: ttlSeconds,
        });

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: false,
        });

        const token = await at.toJwt();

        return NextResponse.json({ 
            token, 
            serverUrl: wsUrl,
            roomName,
            duration: durationSeconds
        });
    } catch (err) {
        console.error("Token generation error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
