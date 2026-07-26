/**
 * app/api/demo/start/route.ts
 * ────────────────────────────
 * POST → Validate business email → Create DemoSession → Generate LiveKit token
 *
 * Body: { templateId, clientName, clientEmail }
 *
 * Returns: { sessionId, token, url, roleLabel, mode, duration }
 *
 * The LiveKit agent receives metadata:
 *   { demoSessionId, templateId, mode, roleTitle, timeLimitMins: 5, isDemo: true }
 * and uses this to:
 *   - Build the interview brief from the pre-generated question bank (TECH or CONVERSATION)
 *   - Activate the 4.9-minute kill switch (294 seconds)
 *   - Write the transcript back to DemoSession on completion
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/prisma-demo";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { normalizeEmail } from "@/lib/email";
import { apiErrorResponse } from "@/lib/slack-error-logger";

const DEMO_DURATION_MINS = 5;
const DEMO_KILL_SWITCH_SECS = 294; // 4.9 minutes

export async function POST(request: Request) {
    try {
        const { templateId, clientName, clientEmail } = await request.json();

        // --- Validate inputs ---
        if (!templateId || !clientName?.trim() || !clientEmail?.trim()) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }
        // Require the email to have completed OTP verification (see
        // /api/demo/otp/send + /api/demo/otp/verify) -- this proves the visitor
        // actually controls the inbox, not just that the domain has mail service.
        const normalizedEmail = normalizeEmail(clientEmail);
        const verification = await db.demoEmailVerification.findUnique({ where: { email: normalizedEmail } });
        if (!verification || !verification.verified || verification.expiresAt.getTime() < Date.now()) {
            return NextResponse.json({
                error: "Please verify your email before starting the interview.",
                code: "EMAIL_NOT_VERIFIED",
            }, { status: 400 });
        }

        // --- Load the template (must be ready) ---
        const template = await db.demoTemplate.findUnique({
            where: { id: templateId },
        });
        if (!template || !template.isActive || template.status !== "ready") {
            return NextResponse.json({ error: "Demo template not found or not ready" }, { status: 404 });
        }
        if (!template.questionBankSnapshot) {
            return NextResponse.json({ error: "Demo template questions not yet generated" }, { status: 409 });
        }

        // --- Create the DemoSession ---
        const demoSession = await db.demoSession.create({
            data: {
                templateId,
                clientName: clientName.trim(),
                clientEmail: normalizedEmail,
                status: "LAUNCHING",
            },
        });

        // --- Build LiveKit room + token ---
        const roomName = `demo_${demoSession.id}`;
        const participantIdentity = `demo_candidate_${demoSession.id}`;
        const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;
        const agentName = process.env.LIVEKIT_AGENT_NAME || "ai_interviewer";

        // Update session with room name
        await db.demoSession.update({
            where: { id: demoSession.id },
            data: { livekitRoomName: roomName },
        });

        // Dispatch agent (best-effort, non-blocking)
        void (async () => {
            try {
                const apiKey = process.env.LIVEKIT_API_KEY;
                const apiSecret = process.env.LIVEKIT_API_SECRET;
                const rawUrl = process.env.LIVEKIT_URL;
                if (!apiKey || !apiSecret || !rawUrl) return;
                const host = `https://${rawUrl.trim().replace(/^(wss?|https?):\/\//, "")}`;
                const roomClient = new RoomServiceClient(host, apiKey, apiSecret);
                const dispatchClient = new AgentDispatchClient(host, apiKey, apiSecret);
                try {
                    await roomClient.createRoom({ name: roomName, emptyTimeout: 10 * 60, departureTimeout: 60 });
                } catch (e) {
                    const msg = e instanceof Error ? e.message.toLowerCase() : "";
                    if (!msg.includes("already exists")) console.error("[DEMO/START] Room creation failed:", e);
                }
                // Clear any stale dispatches
                try {
                    const existing = await dispatchClient.listDispatch(roomName);
                    for (const d of existing) await dispatchClient.deleteDispatch(d.id, roomName).catch(() => { });
                } catch { }
                // Dispatch with DEMO-specific metadata
                await dispatchClient.createDispatch(roomName, agentName, {
                    metadata: JSON.stringify({
                        // Demo-specific flags
                        isDemo: true,
                        demoSessionId: demoSession.id,
                        templateId,
                        mode: template.mode,            // "TECH" | "CONVERSATION"
                        questionBankJson: template.questionBankSnapshot,  // pre-generated question bank — no LLM call at agent start
                        // Standard interview fields (agent reads these)
                        candidateName: clientName.trim(),
                        roleLabel: template.roleTitle,
                        timeLimitMins: DEMO_KILL_SWITCH_SECS / 60,
                        killSwitchSecs: DEMO_KILL_SWITCH_SECS,
                    }),
                });
            } catch (e) {
                console.error("[DEMO/START] Agent warmup error:", e);
            }
        })();

        // Build candidate token
        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            { identity: participantIdentity, ttl: "30m" }
        );
        at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canPublishData: true, canSubscribe: true });

        return NextResponse.json({
            sessionId: demoSession.id,
            token: await at.toJwt(),
            url: serverUrl,
            roleLabel: template.roleTitle,
            mode: template.mode,
            duration: DEMO_KILL_SWITCH_SECS,
            candidateName: clientName.trim(),
        });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/demo/start",
            method: "POST",
            error,
            body: { error: "Failed to start demo session" },
            status: 500,
            logLabel: "[DEMO/START] error:",
        });
    }
}
