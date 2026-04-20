import { EgressClient, EncodedFileOutput, EncodingOptionsPreset } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
        const { applicationId } = await req.json();
        if (!applicationId) {
            return NextResponse.json({ error: "applicationId required" }, { status: 400 });
        }

        const roomName = "interview_" + applicationId;

        // Idempotent - check DB so dedup survives server restarts
        const existing = await prisma.interview.findUnique({
            where: { applicationId },
            select: { interviewRecordingUrl: true },
        });
        if (existing?.interviewRecordingUrl) {
            console.log(`[start-recording] Already started for ${roomName}, skipping.`);
            return NextResponse.json({ ok: true, skipped: true });
        }

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const rawUrl = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !rawUrl) {
            return NextResponse.json({ error: "Server configuration missing" }, { status: 500 });
        }

        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            select: { fullName: true, drive: { select: { title: true } } },
        });

        const candidateName = (application?.fullName || "candidate")
            .replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "_").toLowerCase();
        const roleTitle = (application?.drive?.title || "interview")
            .replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "_").toLowerCase();
        const timestamp = Date.now();

        const egressClient = new EgressClient(toHttpUrl(rawUrl), apiKey, apiSecret);

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

        // Persist recording URL to DB
        const r2InterviewUrl = process.env.NEXT_PUBLIC_R2_INTERVIEW_URL || "https://pub-e4a8b24775c741f6a650def856cfec9f.r2.dev";
        const recordingUrl = `${r2InterviewUrl.replace(/\/$/, "")}/candidates/${candidateName}_${roleTitle}/recordings/interview_${applicationId}_${timestamp}.mp4`;

        await prisma.interview.update({
            where: { applicationId },
            data: { interviewRecordingUrl: recordingUrl, interviewRecordedAt: new Date() },
        }).catch((e) => console.warn("[start-recording] DB update failed:", e));

        console.log(`[start-recording] Egress started for ${roomName}`);
        return NextResponse.json({ ok: true, recordingUrl });

    } catch (error) {
        console.error("[start-recording] error:", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: "Failed to start recording" }, { status: 500 });
    }
}
