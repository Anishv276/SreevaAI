import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInterviewReopenAllowed, isInterviewTokenRequired } from "@/lib/interview-access";

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

        // ── LIFECYCLE CHECK ──────────────────────────────
        if (!allowReopen && (interview?.status === "COMPLETED" || interview?.status === "FAILED")) {
            return NextResponse.json({ error: "Access Denied: Interview already finalized" }, { status: 403 });
        }

        if (interview?.expiresAt && interview.expiresAt < new Date()) {
            return NextResponse.json({ error: "Access Denied: Interview session has expired" }, { status: 403 });
        }
        // ─────────────────────────────────────────────────

        const roomName = `interview_${applicationId}`;
        const participantIdentity = `candidate_${applicationId}`;

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
            url: process.env.LIVEKIT_URL,
        });
    } catch (error) {
        console.error("LiveKit token error:", error);
        return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
    }
}
