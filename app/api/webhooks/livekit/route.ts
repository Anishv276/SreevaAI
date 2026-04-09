import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { prisma } from "@/lib/prisma";

/**
 * LiveKit Webhook Handler
 * Receives egress_ended events and persists the recording URL to the Interview record.
 * 
 * Self-hosted setup: Add this URL to your livekit.yaml under `webhook.urls`:
 *   webhook:
 *     api_key: 'your-api-key'
 *     urls:
 *       - 'https://yourapp.com/api/webhooks/livekit'
 */
export async function POST(req: NextRequest) {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
        return NextResponse.json({ error: "Server configuration missing" }, { status: 500 });
    }

    try {
        const body = await req.text();
        const authHeader = req.headers.get("Authorization") ?? "";

        // Validate webhook signature using LiveKit's server SDK
        const receiver = new WebhookReceiver(apiKey, apiSecret);
        let event: Awaited<ReturnType<typeof receiver.receive>>;
        try {
            event = await receiver.receive(body, authHeader);
        } catch (verifyErr) {
            console.warn("[Webhook] Signature verification failed:", verifyErr);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        console.log(`[Webhook] Received event: ${event.event}`);

        // Only handle egress_ended events
        if (event.event !== "egress_ended") {
            return NextResponse.json({ ok: true });
        }

        const egressInfo = event.egressInfo;
        if (!egressInfo) {
            return NextResponse.json({ ok: true });
        }

        // Extract application ID from file path:
        // Path format: candidates/{name}/recordings/interview_{applicationId}_{timestamp}.mp4
        const filePath = egressInfo.fileResults?.[0]?.filename ?? "";
        const match = filePath.match(/interview_([^_]+(?:_[^_]+)*?)_\d+\.mp4$/);
        
        if (!match) {
            console.warn("[Webhook] Could not parse applicationId from filepath:", filePath);
            return NextResponse.json({ ok: true });
        }

        // The applicationId is everything before the last _timestamp
        // Since cuid IDs have no underscores, we can safely extract it
        const applicationId = match[1];
        const downloadUrl = (egressInfo.fileResults?.[0] as any)?.downloadUrl ?? egressInfo.fileResults?.[0]?.location ?? "";
        const durationSeconds = Number(egressInfo.fileResults?.[0]?.duration ?? 0) / 1_000_000_000; // proto: nanoseconds

        if (!applicationId || !downloadUrl) {
            console.warn("[Webhook] Missing applicationId or downloadUrl:", { applicationId, downloadUrl });
            return NextResponse.json({ ok: true });
        }

        console.log(`[Webhook] Egress ended for App ${applicationId}. URL: ${downloadUrl}`);

        // Persist recording URL to the Interview record
        await prisma.interview.upsert({
            where: { applicationId },
            update: {
                interviewRecordingUrl: downloadUrl,
                interviewRecordedAt: new Date(),
                interviewDuration: Math.round(durationSeconds),
                status: "COMPLETED",
                completedAt: new Date(),
            },
            create: {
                applicationId,
                interviewRecordingUrl: downloadUrl,
                interviewRecordedAt: new Date(),
                interviewDuration: Math.round(durationSeconds),
                status: "COMPLETED",
                completedAt: new Date(),
            },
        });

        console.log(`[Webhook] Successfully updated Interview record for App ${applicationId}`);
        return NextResponse.json({ ok: true });

    } catch (err) {
        console.error("[Webhook] Handler error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
