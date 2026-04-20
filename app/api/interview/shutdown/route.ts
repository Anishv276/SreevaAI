import { AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { interviewShutdownSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { isInterviewTokenRequired } from "@/lib/interview-access";

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
        const result = interviewShutdownSchema.safeParse(body);
        
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { applicationId, interviewToken } = result.data;
        const requireInterviewToken = isInterviewTokenRequired();

        // -- AUTHENTICATION --------------------------------
        const interview = await prisma.interview.findUnique({
            where: { applicationId },
            select: { accessToken: true }
        });
        if (requireInterviewToken && (!interview || interview.accessToken !== interviewToken)) {
            return NextResponse.json({ error: "Unauthorized: Invalid security token" }, { status: 401 });
        }

        const roomName = "interview_" + applicationId;

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const rawUrl = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !rawUrl) {
            return NextResponse.json({ error: "Server configuration missing" }, { status: 500 });
        }

        const host = toHttpUrl(rawUrl);
        const dispatchClient = new AgentDispatchClient(host, apiKey, apiSecret);
        const roomClient = new RoomServiceClient(host, apiKey, apiSecret);

        console.log(`[SHUTDOWN] Request for room: ${roomName}`);

        // 1. Terminate any active dispatches
        try {
            const dispatches = await dispatchClient.listDispatch(roomName);
            if (dispatches && dispatches.length > 0) {
                console.log(`[SHUTDOWN] Deleting ${dispatches.length} dispatches for ${roomName}`);
                for (const d of dispatches) {
                    await dispatchClient.deleteDispatch(d.id, roomName);
                }
            }
        } catch (err) {
            console.warn(`[SHUTDOWN] Error listing/deleting dispatches for ${roomName}:`, err);
        }

        // 2. Remove any agent participants still in the room
        try {
            const participants = await roomClient.listParticipants(roomName);
            const agents = participants.filter(p => {
                const identity = p.identity.toLowerCase();
                const name = (p.name || "").toLowerCase();
                return identity.startsWith("aw_") || identity.includes("agent") || name.includes("agent");
            });

            if (agents.length > 0) {
                console.log(`[SHUTDOWN] Removing ${agents.length} agent participants from ${roomName}`);
                for (const agent of agents) {
                    await roomClient.removeParticipant(roomName, agent.identity);
                }
            }
        } catch (err) {
            // Room might not exist yet or already be gone, which is fine
            console.log(`[SHUTDOWN] Room ${roomName} check finished (might not exist).`);
        }

        return NextResponse.json({ success: true, roomName });
    } catch (err) {
        console.error("[SHUTDOWN] Internal error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
