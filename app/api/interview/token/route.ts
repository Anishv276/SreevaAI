import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { isInterviewReopenAllowed, isInterviewTokenRequired } from "@/lib/interview-access";
import { z } from "zod";
import { DEFAULT_PROCTORING_SIGNALS, isProctoringSignalEnabled, normalizeProctoringSignals } from "@/lib/proctoring-signals";
import { getProctoringCategory } from "@/lib/proctoring";
import { FIXED_INTERVIEW_DURATION_MINUTES } from "@/lib/drive-limits";

const DISPATCH_DEBOUNCE_MS = 12_000;
const dispatchByRoom = new Map<string, number>();

// --- Device fingerprint shape sent by the client -----------------------------
interface DeviceFingerprint {
    screen:    string;   // "1920x1080x24"
    cpuCores:  number;
    platform:  string;   // "Windows / Chrome"
    dpr:       number;
    tzOffset:  number;
}

const interviewWarmTokenSchema = z.object({
    applicationId:   z.string().min(1, "Application ID required"),
    interviewToken:  z.string().optional(),
    participantName: z.string().min(1, "Participant name required").max(100),
    deviceFingerprint: z.object({
        screen:    z.string(),
        cpuCores:  z.number(),
        platform:  z.string(),
        dpr:       z.number(),
        tzOffset:  z.number(),
    }).optional(),
});

// --- IP Extraction & Hashing --------------------------------------------------
/**
 * Reads the real client IP from standard proxy/CDN HTTP headers.
 *
 * Header priority (most -> least trustworthy in a typical reverse-proxy setup):
 *   1. cf-connecting-ip   - Cloudflare: always the browser IP, cannot be spoofed
 *   2. x-real-ip          - Nginx / load-balancer: single real IP
 *   3. x-forwarded-for    - Standard proxy chain: left-most entry is the client
 *   4. x-client-ip        - Less common, used by some CDNs
 *
 * Returns null if no recognisable IP header is present (e.g., local dev).
 */
function extractClientIp(req: NextRequest): string | null {
    const headers = req.headers;

    // Cloudflare (most reliable - always set by CF edge, not forwardable by client)
    const cf = headers.get("cf-connecting-ip");
    if (cf) return cf.trim();

    // Single real-IP set by nginx / ALB
    const realIp = headers.get("x-real-ip");
    if (realIp) return realIp.trim();

    // X-Forwarded-For: "client, proxy1, proxy2" - take the left-most (original client)
    const xff = headers.get("x-forwarded-for");
    if (xff) {
        const first = xff.split(",")[0].trim();
        if (first) return first;
    }

    // Fallback: x-client-ip (less common)
    const xci = headers.get("x-client-ip");
    if (xci) return xci.trim();

    return null;
}

/**
 * SHA-256 hash the raw IP address so we never store PII in plain text.
 * We add a fixed application-level salt so the hash cannot be rainbow-tabled
 * against a generic IPv4/v6 space.
 */
function hashIp(rawIp: string): string {
    const salt = process.env.IP_HASH_SALT || "sreeva_proctor_salt_v1";
    return crypto
        .createHmac("sha256", salt)
        .update(rawIp.toLowerCase())
        .digest("hex");
}

/**
 * Hash the device fingerprint using the same salt.
 * Combines all capability fields into a single deterministic string
 * before hashing so a "same device" match is reliable across sessions.
 */
function hashDevice(fp: DeviceFingerprint): string {
    const salt   = process.env.IP_HASH_SALT || "sreeva_proctor_salt_v1";
    const raw    = `${fp.screen}|${fp.cpuCores}|${fp.platform}|${fp.dpr}|${fp.tzOffset}`;
    return crypto
        .createHmac("sha256", salt)
        .update(raw.toLowerCase())
        .digest("hex");
}

// --- Proctoring event helpers -------------------------------------------------
type StoredEvent = {
    eventType: string;
    severity?: string;
    reason?: string;
    timestamp?: number;
    metadata?: Record<string, unknown>;
};

function parseStoredEvents(raw: unknown): StoredEvent[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as StoredEvent[];
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
    }
    return [];
}

function appendAndSave(
    existingRaw: unknown,
    newEvents: StoredEvent[],
    applicationId: string,
): Promise<void> {
    const existing = parseStoredEvents(existingRaw);
    const merged   = [...existing, ...newEvents].slice(-400);
    return prisma.$executeRawUnsafe(
        `UPDATE "Interview"
         SET "proctoringEvents" = $1::jsonb, "updatedAt" = $2
         WHERE "applicationId" = $3`,
        JSON.stringify(merged),
        new Date(),
        applicationId,
    ).then(() => undefined);
}

// --- Util ---------------------------------------------------------------------
function looksLikeAgentParticipant(participant: { identity?: string; name?: string }) {
    const identity = (participant.identity || "").toLowerCase();
    const name     = (participant.name     || "").toLowerCase();
    return identity.startsWith("aw_") || identity.includes("agent") || name.includes("agent");
}

function cleanupDispatchMap() {
    const now       = Date.now();
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    if (dispatchByRoom.size > 1000) { dispatchByRoom.clear(); return; }
    for (const [room, timestamp] of dispatchByRoom.entries()) {
        if (now - timestamp > TWO_HOURS) dispatchByRoom.delete(room);
    }
}

function toWsUrl(rawUrl: string) {
    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://") && !rawUrl.startsWith("ws://") && !rawUrl.startsWith("wss://")) {
        return `wss://${rawUrl}`;
    }
    if (rawUrl.startsWith("http://"))  return rawUrl.replace("http://",  "ws://");
    if (rawUrl.startsWith("https://")) return rawUrl.replace("https://", "wss://");
    return rawUrl;
}

function toHttpUrl(rawUrl: string) {
    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://") && !rawUrl.startsWith("ws://") && !rawUrl.startsWith("wss://")) {
        return `https://${rawUrl}`;
    }
    if (rawUrl.startsWith("wss://")) return rawUrl.replace("wss://", "https://");
    if (rawUrl.startsWith("ws://"))  return rawUrl.replace("ws://",  "http://");
    return rawUrl;
}

// --- Main handler -------------------------------------------------------------
export async function POST(req: NextRequest) {
    cleanupDispatchMap();
    try {
        const body   = await req.json();
        const result = interviewWarmTokenSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 },
            );
        }

        const { applicationId, interviewToken, participantName, deviceFingerprint } = result.data;
        const requireInterviewToken = isInterviewTokenRequired();
        const allowReopen           = isInterviewReopenAllowed();

        // -- AUTHENTICATION --------------------------------------------------
        const interview = await prisma.interview.findUnique({
            where:  { applicationId },
            select: { accessToken: true, status: true, expiresAt: true },
        });

        if (requireInterviewToken && (!interview || interview.accessToken !== interviewToken)) {
            return NextResponse.json({ error: "Unauthorized: Invalid interview security token" }, { status: 401 });
        }

        // -- LIFECYCLE CHECK -------------------------------------------------
        if (!allowReopen && (interview?.status === "COMPLETED" || interview?.status === "FAILED")) {
            return NextResponse.json({ error: "Access Denied: Interview already finalized" }, { status: 403 });
        }
        if (!allowReopen && interview?.expiresAt && interview.expiresAt < new Date()) {
            return NextResponse.json({ error: "Access Denied: Interview session has expired" }, { status: 403 });
        }

        // -- APPLICATION LOOKUP ----------------------------------------------
        console.log("[DEBUG] Fetching token for applicationId:", applicationId);
        const application = await prisma.application.findUnique({
            where:   { id: applicationId },
            include: {
                drive: {
                    include: {
                        organization: {
                            select: { proctoringSignals: true },
                        },
                    },
                },
            },
        });
        if (!application) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }
        const orgToggles = normalizeProctoringSignals(
            application.drive.organization?.proctoringSignals || DEFAULT_PROCTORING_SIGNALS,
        );

        // -- SMART COLLUSION DETECTION ---------------------------------------
        //
        // Three-tier severity model:
        //
        // TIER 1 - Simultaneous + Same Device  (HIGH)
        //   ipHash matches AND deviceHash matches AND both sessions IN_PROGRESS
        //   at the SAME TIME. Near-impossible by accident.
        //
        // TIER 2 - Sequential + Same Device  (MEDIUM)
        //   ipHash matches AND deviceHash matches BUT colliding session is COMPLETED.
        //   Classic "borrowed laptop after first friend finished."
        //
        // TIER 3 - IP-only match, Different Device  (LOW)
        //   ipHash matches BUT deviceHash is different. Normal in universities,
        //   offices, or public WiFi spots.
        //
        // Notes: IP + Device data are HMAC-SHA256 hashed - never stored raw.
        //        Token is always issued - flag-not-block policy.
        // ----------------------------------------------------------------------
        void (async () => {

            try {
                if (!isProctoringSignalEnabled(orgToggles, getProctoringCategory("duplicate_ip"))) {
                    return;
                }

                const rawIp = extractClientIp(req);
                if (!rawIp) return; // local dev / internal - skip

                const ipHash     = hashIp(rawIp);
                const deviceHash = deviceFingerprint ? hashDevice(deviceFingerprint) : null;
                const now        = Date.now();

                // --- Write ip_registered + device_registered event for this session ---
                const thisIv = await prisma.interview.findUnique({
                    where:  { applicationId },
                    select: { proctoringEvents: true },
                });
                if (!thisIv) return;

                const registrationEvent: StoredEvent = {
                    eventType: "ip_registered",
                    severity:  "low",
                    reason:    "Candidate network and device fingerprint recorded",
                    timestamp: now,
                    metadata:  {
                        ipHash,
                        ...(deviceHash ? { deviceHash } : {}),
                        platform: deviceFingerprint?.platform ?? "unknown",
                    },
                };
                await appendAndSave(thisIv.proctoringEvents, [registrationEvent], applicationId);

                // --- Query colliders: all interviews on the same drive whose
                //     proctoringEvents JSON contains the same ipHash ---
                const colliders = await prisma.$queryRaw<{
                    applicationId: string;
                    status: string;
                    proctoringEvents: unknown;
                }[]>`
                    SELECT i."applicationId", i."status", i."proctoringEvents"
                    FROM   "Interview" i
                    JOIN   "Application" a ON a.id = i."applicationId"
                    WHERE  a."driveId"        = ${application.driveId}
                    AND    i."applicationId" != ${applicationId}
                    AND    i."proctoringEvents"::text LIKE ${"\%" + ipHash + "\%"}
                `;

                if (colliders.length === 0) return; // no IP collision at all

                const tsNow = Date.now();

                for (const collider of colliders) {
                    // ----------------------------------------------------------
                    // STEP 1: Extract the collider's device hash from their
                    //         stored ip_registered metadata
                    // ----------------------------------------------------------
                    let colliderDeviceHash: string | null = null;
                    try {
                        const events = parseStoredEvents(collider.proctoringEvents);
                        const reg    = events.find(e => e.eventType === "ip_registered" && e.metadata?.ipHash === ipHash);
                        colliderDeviceHash = (reg?.metadata?.deviceHash as string) ?? null;
                    } catch { /* ignore parse errors */ }

                    // ----------------------------------------------------------
                    // STEP 2: Determine severity tier
                    // ----------------------------------------------------------
                    const deviceMatch = deviceHash !== null &&
                                        colliderDeviceHash !== null &&
                                        deviceHash === colliderDeviceHash;

                    const isSimultaneous = collider.status === "IN_PROGRESS";
                    const isSequential   = collider.status === "COMPLETED";

                    let severity: "high" | "medium" | "low";
                    let collisionType: string;
                    let reason: string;

                    if (deviceMatch && isSimultaneous) {
                        // TIER 1 - Worst case: same device, same time
                        severity      = "high";
                        collisionType = "simultaneous_device_match";
                        reason        = `Identical device detected in a simultaneous interview session (${collider.applicationId}). Likely same laptop being used by two candidates at once.`;
                    } else if (deviceMatch && isSequential) {
                        // TIER 2 - Same device but sequential (borrowed laptop)
                        severity      = "medium";
                        collisionType = "sequential_device_reuse";
                        reason        = `Same device used in a previously completed session (${collider.applicationId}). Possible borrowed laptop after prior candidate finished.`;
                    } else {
                        // TIER 3 - Shared IP only (university, office, public WiFi)
                        severity      = "low";
                        collisionType = "shared_network_only";
                        reason        = `Shared network (same IP) detected with session ${collider.applicationId}. Device hardware differs - likely a campus or corporate network.`;
                    }

                    // ----------------------------------------------------------
                    // STEP 3: Flag THIS session
                    // ----------------------------------------------------------
                    const flagThisEvent: StoredEvent = {
                        eventType: "duplicate_ip",
                        severity,
                        reason,
                        timestamp: tsNow,
                        metadata: {
                            ipHash,
                            ...(deviceHash        ? { deviceHash }        : {}),
                            ...(colliderDeviceHash ? { colliderDeviceHash } : {}),
                            collisionType,
                            collidingApplicationId: collider.applicationId,
                            collidingStatus: collider.status,
                            platform: deviceFingerprint?.platform ?? "unknown",
                        },
                    };

                    const thisIvFresh = await prisma.interview.findUnique({
                        where:  { applicationId },
                        select: { proctoringEvents: true },
                    });
                    if (thisIvFresh) {
                        await appendAndSave(thisIvFresh.proctoringEvents, [flagThisEvent], applicationId);
                    }

                    // ----------------------------------------------------------
                    // STEP 4: Flag the COLLIDER session (only if still active)
                    //         If COMPLETED, its audit trail is frozen - don't
                    //         alter it, but log a note in THIS session's metadata.
                    // ----------------------------------------------------------
                    if (isSimultaneous) {
                        try {
                            const colliderIv = await prisma.interview.findUnique({
                                where:  { applicationId: collider.applicationId },
                                select: { proctoringEvents: true },
                            });
                            if (colliderIv) {
                                const reverseReason = deviceMatch
                                    ? `Identical device detected joining a new simultaneous session (${applicationId}).`
                                    : `Shared network detected with a new session (${applicationId}). Different devices - likely shared campus/office WiFi.`;

                                const flagColliderEvent: StoredEvent = {
                                    eventType: "duplicate_ip",
                                    severity,
                                    reason:    reverseReason,
                                    timestamp: tsNow,
                                    metadata: {
                                        ipHash,
                                        collisionType,
                                        collidingApplicationId: applicationId,
                                        platform: deviceFingerprint?.platform ?? "unknown",
                                    },
                                };
                                await appendAndSave(colliderIv.proctoringEvents, [flagColliderEvent], collider.applicationId);
                            }
                        } catch (err) {
                            console.error(`[SmartCollusion] Failed to flag collider ${collider.applicationId}:`, err);
                        }
                    }

                    console.warn(
                        `[SmartCollusion] ${collisionType.toUpperCase()} | ` +
                        `severity=${severity} | ` +
                        `thisApp=${applicationId} | ` +
                        `collider=${collider.applicationId} | ` +
                        `deviceMatch=${deviceMatch} | ` +
                        `colliderStatus=${collider.status}`
                    );
                }
            } catch (err) {
                // Non-fatal - collusion detection must never block token issuance
                console.error("[SmartCollusion] Detection error (non-fatal):", err);
            }
        })();
        // -- END SMART COLLUSION DETECTION ---------------------------------------

        const durationSeconds = Math.floor(FIXED_INTERVIEW_DURATION_MINUTES * 60);

        const apiKey    = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const rawUrl    = process.env.LIVEKIT_URL;
        const agentName = process.env.LIVEKIT_AGENT_NAME || "ai_interviewer";

        if (!apiKey || !apiSecret || !rawUrl) {
            return NextResponse.json({ error: "Server configuration missing" }, { status: 500 });
        }

        const wsUrl    = toWsUrl(rawUrl);
        const roomName = "interview_" + applicationId;

        // Best-effort warmup only. Do not block token issuance if LiveKit room
        // creation or agent dispatch fails, because the client can still join
        // the interview room with the JWT below.
        void (async () => {
            try {
                const host = toHttpUrl(rawUrl);
                const roomClient = new (await import("livekit-server-sdk")).RoomServiceClient(host, apiKey, apiSecret);
                const dispatchClient = new (await import("livekit-server-sdk")).AgentDispatchClient(host, apiKey, apiSecret);

                try {
                    const roomMetadata = JSON.stringify({
                        applicationId,
                        extractedDetails: application.drive.extractedDetails || "{}",
                        structuredResume: (application as any).structuredResume || "{}",
                        aiReport: application.aiReport || "{}",
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
                        console.error("LiveKit room warmup warning:", roomErr);
                    }
                }

                const now2 = Date.now();
                const lastDispatchAt = dispatchByRoom.get(roomName) || 0;
                const inDebounceWin = now2 - lastDispatchAt < DISPATCH_DEBOUNCE_MS;
                if (inDebounceWin) {
                    return;
                }

                try {
                    const dispatchMetadata = JSON.stringify({
                        applicationId,
                        candidateName: application.fullName,
                        roleLabel: application.drive.role || application.drive.title || "Interview",
                        roomName,
                        timeLimitMins: driveDurationMins,
                    });
                    await dispatchClient.createDispatch(roomName, agentName, {
                        metadata: dispatchMetadata,
                    });
                    dispatchByRoom.set(roomName, now2);
                } catch (dispatchErr) {
                    const msg = dispatchErr instanceof Error ? dispatchErr.message.toLowerCase() : "";
                    if (!msg.includes("already") && !msg.includes("exists")) {
                        console.error("Agent dispatch warning:", dispatchErr);
                    }
                }
            } catch (warmupErr) {
                console.error("LiveKit warmup warning:", warmupErr);
            }
        })();

        // -- ISSUE CANDIDATE JWT TOKEN ---------------------------------------
        const ttlSeconds = Math.max(3600, durationSeconds + 1800);

        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantName + "_" + crypto.randomUUID().slice(0, 8),
            name:     participantName,
            ttl:      ttlSeconds,
        });
        at.addGrant({
            roomJoin:       true,
            room:           roomName,
            canPublish:     true,
            canSubscribe:   true,
            canPublishData: false,
        });

        const token = await at.toJwt();

        return NextResponse.json({
            token,
            serverUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL || wsUrl,
            roomName,
            duration:  durationSeconds,
            roleLabel: application.drive.role || application.drive.title || "Interview",
            candidateName: application.fullName,
            proctoringSignals: normalizeProctoringSignals(
                application.drive.organization?.proctoringSignals || DEFAULT_PROCTORING_SIGNALS,
            ),
        });

    } catch (err) {
        console.error("Token generation error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
