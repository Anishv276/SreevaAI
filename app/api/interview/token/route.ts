import { AccessToken, AgentDispatchClient, EgressClient, EncodedFileOutput, EncodingOptionsPreset, RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { interviewTokenSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

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

        // ── Dev bypass: Allow testing with any application ID in development ──
        if (!application && process.env.NODE_ENV === "development") {
            // Find just ANY application to make it work
            application = await prisma.application.findFirst({
                include: { drive: true }
            });
        }

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

        // ── START SERVER-SIDE RECORDING (LiveKit Egress → Cloudflare R2) ──
        try {
            const egressClient = new EgressClient(toHttpUrl(rawUrl), apiKey, apiSecret);

            const candidateName = (application.fullName || "candidate")
                .replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "_").toLowerCase();
            const roleTitle = ((application.drive as { title?: string }).title || "interview")
                .replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "_").toLowerCase();
            const timestamp = Date.now();

            const fileOutput = new EncodedFileOutput({
                filepath: `candidates/${candidateName}_${roleTitle}/recordings/interview_${applicationId}_${timestamp}.mp4`,
                output: {
                    case: "s3",
                    value: {
                        accessKey: process.env.R2_ACCESS_KEY_ID || "",
                        secret: process.env.R2_SECRET_ACCESS_KEY || "",
                        region: "auto",
                        endpoint: process.env.R2_ENDPOINT || "",
                        bucket: process.env.R2_INTERVIEW_BUCKET || "interviews",
                        forcePathStyle: true,
                    },
                },
            });

            await egressClient.startRoomCompositeEgress(roomName, { file: fileOutput }, {
                layout: "grid",
                encodingOptions: EncodingOptionsPreset.H264_720P_30,
                audioOnly: false,
            });

            // ── Persist the recording URL to DB so profile page can display it ──
            const r2InterviewUrl = process.env.NEXT_PUBLIC_R2_INTERVIEW_URL || "https://pub-e4a8b24775c741f6a650def856cfec9f.r2.dev";
            const recordingUrl = `${r2InterviewUrl.replace(/\/$/, "")}/candidates/${candidateName}_${roleTitle}/recordings/interview_${applicationId}_${timestamp}.mp4`;
            try {
                await prisma.interview.update({
                    where: { applicationId },
                    data: { interviewRecordingUrl: recordingUrl, interviewRecordedAt: new Date() }
                });
                console.log(`[Egress] Recording URL saved to DB: ${recordingUrl}`);
            } catch (dbErr) {
                console.warn("[Egress] Could not save recording URL to DB:", dbErr);
            }

            console.log(`[Egress] Started RoomComposite recording for room ${roomName}`);
        } catch (egressErr) {
            // Non-fatal: interview continues even if Egress service is not yet deployed
            console.warn("[Egress] Could not start recording (non-fatal):", egressErr instanceof Error ? egressErr.message : egressErr);
        }

        // ── ISSUE CANDIDATE JWT TOKEN ──
        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantName + "_" + Math.random().toString(36).substring(7),
            name: participantName,
            ttl: "1h",
        });

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
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
