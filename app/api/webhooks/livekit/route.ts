import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { prisma } from "@/lib/prisma";
import { generateId } from "@/lib/ids";

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
        if (!egressInfo || !egressInfo.egressId) {
            console.warn("[Webhook] Missing egressInfo or egressId");
            return NextResponse.json({ ok: true });
        }

        // Extract application ID from file path:
        // Path format: candidates/{name}/recordings/interview_{applicationId}_{timestamp}.mp4
        const filePath = egressInfo.fileResults?.[0]?.filename ?? "";
        // Regex: Search for applicationId between 'interview_' and the trailing timestamp/extension
        const match = filePath.match(/interview_([^_]+(?:_[^_]+)*?)_\d+\.mp4$/);
        
        if (!match) {
            console.error("[Webhook] Could not parse applicationId from filepath:", filePath);
            return NextResponse.json({ error: "Invalid path format" }, { status: 400 });
        }

        const applicationId = match[1];
        const downloadUrl = (egressInfo.fileResults?.[0] as any)?.downloadUrl ?? egressInfo.fileResults?.[0]?.location ?? "";
        const durationSeconds = Number(egressInfo.fileResults?.[0]?.duration ?? 0) / 1_000_000_000; // proto: nanoseconds

        if (!applicationId || !downloadUrl) {
            console.error("[Webhook] Missing applicationId or downloadUrl:", { applicationId, downloadUrl });
            return NextResponse.json({ error: "Missing required event data" }, { status: 400 });
        }

        // ── 2. Validate Application Existence ────────────────────
        const app = await prisma.application.findUnique({
            where: { id: applicationId },
            select: { id: true }
        });

        if (!app) {
            console.error("[Webhook] Application NOT FOUND in database:", applicationId);
            return NextResponse.json({ error: `Application ${applicationId} not found` }, { status: 400 });
        }

        console.log(`[Webhook] Egress ended for App ${applicationId}. URL: ${downloadUrl}`);

        // ── 3. Atomically Update Interview & Track Webhook ────────
        // Use an interactive transaction to ensure we don't process the same event twice
        const result = await prisma.$transaction(async (tx: any) => {
            // Check idempotency again inside the transaction for absolute safety
            const existing = await tx.processedWebhook.findUnique({
                where: { id: egressInfo.egressId }
            });

            if (existing) {
                return { skipped: true };
            }

            // Perform the update
            await tx.interview.upsert({
                where: { applicationId },
                update: {
                    interviewRecordingUrl: downloadUrl,
                    interviewRecordedAt: new Date(),
                    interviewDuration: Math.round(durationSeconds),
                    status: "COMPLETED",
                    completedAt: new Date(),
                },
                create: {
                    id: generateId("int", applicationId),
                    applicationId,
                    interviewRecordingUrl: downloadUrl,
                    interviewRecordedAt: new Date(),
                    interviewDuration: Math.round(durationSeconds),
                    status: "COMPLETED",
                    completedAt: new Date(),
                },
            });

            // Mark as processed
            await tx.processedWebhook.create({
                data: { id: egressInfo.egressId }
            });

            return { skipped: false };
        });

        if (result.skipped) {
            console.log(`[Webhook] Event ${egressInfo.egressId} already processed. Skipping.`);
            return NextResponse.json({ ok: true });
        }

        console.log(`[Webhook] Successfully updated Interview and marked event ${egressInfo.egressId} as processed`);
        return NextResponse.json({ ok: true });

    } catch (err) {
        console.error("[Webhook] Handler error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
