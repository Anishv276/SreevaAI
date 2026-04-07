import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: applicationId } = await params;
        const { token: interviewToken } = await request.json();

        if (!applicationId || !interviewToken) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Verify the interview token against the database
        let interview;
        if (interviewToken === "dev-bypass" && process.env.NODE_ENV === "development") {
            // Find any interview for this application to bypass for testing
            interview = await prisma.interview.findFirst({
                where: { applicationId },
            });
        } else {
            interview = await prisma.interview.findFirst({
                where: {
                    applicationId,
                    accessToken: interviewToken,
                },
            });
        }

        if (!interview) {
            return NextResponse.json({ error: "Invalid interview token" }, { status: 401 });
        }

        // Generate LiveKit token
        const roomName = `interview_${applicationId}`;
        const participantIdentity = `candidate_${applicationId}`;

        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            {
                identity: participantIdentity,
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
            url: process.env.LIVEKIT_URL 
        });
    } catch (error) {
        console.error("LiveKit token error:", error);
        return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
    }
}
