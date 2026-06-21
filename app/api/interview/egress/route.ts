import { EgressClient, EgressStatus } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { interviewRecordingQueue } from "@/lib/queue";
import {
    computeRecordingRetentionDueAt,
    getOrgRecordingSettings,
    normalizeRecordingRetentionDays,
} from "@/lib/recording-retention";
import { mergeRecordingState, normalizeRecordingState, parseJsonRecord, type RecordingState } from "@/lib/recording-state";
export const runtime = "nodejs";
type EgressAction = "start" | "stop" | "status";
type EgressManifest = {
    mode?: "livekit_egress";
    roomName?: string;
    egressId?: string;
    recordingKey?: string;
    recordingUrl?: string;
    startedAt?: string | null;
    stopRequestedAt?: string | null;
    stoppedAt?: string | null;
    lastStatus?: string;
    lastError?: string | null;
};
type EgressRequestBody = {
    action?: EgressAction;
    applicationId?: string;
    interviewToken?: string;
};
const INTERVIEW_CANDIDATES_PREFIX = "candidates";
function cleanEnv(value: string | undefined): string {
    return String(value || "")
        .trim()
        .replace(/^"+|"+$/g, "");
}
function toHttpUrl(rawUrl: string): string {
    const trimmed = cleanEnv(rawUrl);
    if (!trimmed) return "";
    if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
    if (trimmed.startsWith("wss://")) return trimmed.replace("wss://", "https://");
    if (trimmed.startsWith("ws://")) return trimmed.replace("ws://", "http://");
    return `https://${trimmed}`;
}
function normalizeManifest(raw: unknown): EgressManifest {
    if (!raw) return {};
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === "object") ? parsed as EgressManifest : {};
        } catch {
            return {};
        }
    }
    if (typeof raw === "object") return raw as EgressManifest;
    return {};
}
function buildCandidateRoleFolder(fullName?: string | null, roleTitle?: string | null, fallbackId?: string): string {
    const raw = [fullName, roleTitle].filter(Boolean).join(" - ") || fallbackId || "candidate";
    return raw
        .replace(/[^a-zA-Z0-9_\- ]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .toLowerCase();
}
function buildRecordingName(fullName?: string | null, roleTitle?: string | null, fallbackId?: string) {
    return [fullName, roleTitle].filter(Boolean).join(" - ") || fallbackId || "Interview recording";
}
function buildPublicInterviewUrl(recordingKey: string): string {
    const base = cleanEnv(process.env.NEXT_PUBLIC_R2_INTERVIEW_URL);
    if (!base) return "";
    return `${base.replace(/\/$/, "")}/${recordingKey}`;
}
function statusToLabel(status: EgressStatus | number | undefined): string {
    switch (status) {
        case EgressStatus.EGRESS_STARTING:
            return "STARTING";
        case EgressStatus.EGRESS_ACTIVE:
            return "ACTIVE";
        case EgressStatus.EGRESS_ENDING:
            return "ENDING";
        case EgressStatus.EGRESS_COMPLETE:
            return "COMPLETE";
        case EgressStatus.EGRESS_FAILED:
            return "FAILED";
        case EgressStatus.EGRESS_ABORTED:
            return "ABORTED";
        case EgressStatus.EGRESS_LIMIT_REACHED:
            return "LIMIT_REACHED";
        default:
            return "UNKNOWN";
    }
}
function isTerminalRecordingStatus(status: string) {
    return ["COMPLETE", "COMPLETED", "FAILED", "ABORTED", "LIMIT_REACHED"].includes(
        String(status || "").trim().toUpperCase()
    );
}
function addSeconds(base: Date | null, seconds: number | null | undefined) {
    if (!base || !Number.isFinite(base.getTime()) || !seconds || seconds <= 0) return null;
    return new Date(base.getTime() + Math.round(seconds) * 1000);
}
async function getRetentionDaysForApplication(applicationId: string) {
    const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { drive: { select: { orgId: true } } },
    }).catch(() => null);
    const orgId = String(application?.drive?.orgId || "");
    if (!orgId) return null;
    const settings = await getOrgRecordingSettings(orgId);
    return settings.recordingEnabled ? settings.recordingRetentionDays : null;
}
async function authenticateInterview(applicationId: string, interviewToken: string, requireInterviewToken: boolean) {
    const interviewRecord = await prisma.interview.findUnique({
        where: { applicationId },
        select: { accessToken: true },
    });
    if (requireInterviewToken && (!interviewRecord || interviewRecord.accessToken !== interviewToken)) {
        return false;
    }
    return true;
}
async function getInterviewManifest(applicationId: string): Promise<EgressManifest> {
    const row = await prisma.interview.findUnique({
        where: { applicationId },
        select: { recording: true },
    });
    const recording = normalizeRecordingState(row?.recording);
    return normalizeManifest(recording.manifest);
}
async function persistRecordingState(params: {
    applicationId: string;
    status: string;
    mimeType?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    manifest?: EgressManifest;
    recordingUrl?: string | null;
    durationSec?: number | null;
    recordingName?: string | null;
    recordingKey?: string | null;
    retentionDays?: number | null;
}) {
    const {
        applicationId,
        status,
        mimeType = null,
        startedAt = null,
        completedAt = null,
        manifest = {},
        recordingUrl = null,
        durationSec = null,
        recordingName = null,
        recordingKey = null,
        retentionDays = undefined,
    } = params;
    const currentRow = await prisma.interview.findUnique({
        where: { applicationId },
        select: { recording: true },
    }).catch(() => null);
    const currentManifest = normalizeManifest(
        normalizeRecordingState(currentRow?.recording).manifest
    );
    const nextManifest = {
        ...currentManifest,
        ...manifest,
        lastStatus: status,
    };
    const resolvedKey = recordingKey || String(nextManifest.recordingKey || "").trim() || null;
    const resolvedUrl = recordingUrl || String(nextManifest.recordingUrl || "").trim() || null;
    const normalizedRetentionDays = normalizeRecordingRetentionDays(
        retentionDays === undefined ? await getRetentionDaysForApplication(applicationId) : retentionDays
    );
    const terminalWithAsset = isTerminalRecordingStatus(status) && Boolean(resolvedKey || resolvedUrl);
    const retentionBase =
        completedAt
        || addSeconds(startedAt, durationSec)
        || (nextManifest.startedAt ? addSeconds(new Date(nextManifest.startedAt), durationSec) : null)
        || startedAt
        || null;
    const retentionDueAt = terminalWithAsset && normalizedRetentionDays !== null
        ? computeRecordingRetentionDueAt(retentionBase, normalizedRetentionDays)
        : null;
    const nextRecording = mergeRecordingState(currentRow?.recording, {
        ...(recordingName ? { name: recordingName } : {}),
        mode: nextManifest.mode || "livekit_egress",
        status,
        mimeType,
        url: recordingUrl || undefined,
        key: resolvedKey || undefined,
        egressId: String(nextManifest.egressId || "").trim() || undefined,
        roomName: String(nextManifest.roomName || "").trim() || undefined,
        startedAt: startedAt ? startedAt.toISOString() : undefined,
        completedAt: completedAt ? completedAt.toISOString() : undefined,
        recordedAt: completedAt && recordingUrl ? completedAt.toISOString() : undefined,
        durationSec,
        manifest: parseJsonRecord(nextManifest),
        ...(retentionDueAt && normalizedRetentionDays !== null ? {
            retention: {
                days: normalizedRetentionDays,
                dueAt: retentionDueAt.toISOString(),
                cleanupStatus: "PENDING",
                cleanupAttempts: 0,
                cleanupLastError: null,
                deletedAt: null,
            },
        } : {}),
    } as RecordingState);
    await prisma.$executeRawUnsafe(
        `UPDATE "Interview"
         SET "recording" = $2::jsonb,
             "updatedAt" = NOW()
         WHERE "applicationId" = $1::text`,
        applicationId,
        JSON.stringify(nextRecording)
    );
}
function requiredEnv() {
    const livekitUrl = cleanEnv(process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL);
    const livekitKey = cleanEnv(process.env.LIVEKIT_API_KEY);
    const livekitSecret = cleanEnv(process.env.LIVEKIT_API_SECRET);
    const r2Endpoint = cleanEnv(process.env.R2_ENDPOINT);
    const r2AccessKey = cleanEnv(process.env.R2_ACCESS_KEY_ID);
    const r2SecretKey = cleanEnv(process.env.R2_SECRET_ACCESS_KEY);
    const r2InterviewBucket = cleanEnv(process.env.R2_INTERVIEW_BUCKET || "interview");
    return {
        livekitUrl,
        livekitHost: toHttpUrl(livekitUrl),
        livekitKey,
        livekitSecret,
        r2Endpoint,
        r2AccessKey,
        r2SecretKey,
        r2InterviewBucket,
    };
}
async function findActiveEgressForRoom(egressClient: EgressClient, roomName: string) {
    const list = await egressClient.listEgress({ roomName, active: true });
    const active = list.find((item) =>
        item.status === EgressStatus.EGRESS_ACTIVE || item.status === EgressStatus.EGRESS_STARTING || item.status === EgressStatus.EGRESS_ENDING
    );
    return active || null;
}
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({})) as EgressRequestBody;
        const action: EgressAction = (body.action || "status") as EgressAction;
        const applicationId = String(body.applicationId || "").trim();
        const interviewToken = String(body.interviewToken || "").trim();
        const requireInterviewToken = isInterviewTokenRequired();
        if (!applicationId || (requireInterviewToken && !interviewToken)) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }
        if (!["start", "stop", "status"].includes(action)) {
            return NextResponse.json({ error: "Unsupported egress action" }, { status: 400 });
        }
        if (!(await authenticateInterview(applicationId, interviewToken, requireInterviewToken))) {
            return NextResponse.json({ error: "Unauthorized: Invalid session token" }, { status: 401 });
        }
        const {
            livekitHost,
            livekitKey,
            livekitSecret,
            r2Endpoint,
            r2AccessKey,
            r2SecretKey,
            r2InterviewBucket,
        } = requiredEnv();
        if (!livekitHost || !livekitKey || !livekitSecret) {
            return NextResponse.json({ error: "LiveKit server configuration missing in .env" }, { status: 500 });
        }
        const egressClient = new EgressClient(livekitHost, livekitKey, livekitSecret);
        const roomName = `interview_${applicationId}`;
        const manifest = await getInterviewManifest(applicationId);
        if (action === "status") {
            let active = null;
            try {
                active = await findActiveEgressForRoom(egressClient, roomName);
            } catch {
                active = null;
            }
            return NextResponse.json({
                success: true,
                action,
                roomName,
                egressId: manifest.egressId || active?.egressId || null,
                status: manifest.lastStatus || statusToLabel(active?.status),
                recordingUrl: manifest.recordingUrl || null,
                recordingKey: manifest.recordingKey || null,
            });
        }
        if (action === "start") {
            if (!r2Endpoint || !r2AccessKey || !r2SecretKey) {
                return NextResponse.json({
                    error: "R2 credentials are missing. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY."
                }, { status: 500 });
            }
            const application = await prisma.application.findUnique({
                where: { id: applicationId },
                select: {
                    fullName: true,
                    drive: { select: { title: true, orgId: true, organization: { select: { slug: true } } } },
                },
            });
            const orgSlug = application?.drive?.organization?.slug || application?.drive?.orgId || "unknown-org";
            const driveTitle = (application?.drive?.title || "unknown-job").replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const candName = (application?.fullName || applicationId)
                .replace(/[^a-zA-Z0-9_\- ]/g, "")
                .trim()
                .replace(/\s+/g, "_")
                .toLowerCase();
            const safeCandidate = candName;
            const recordingName = buildRecordingName(
                application?.fullName,
                application?.drive?.title,
                applicationId
            );
            const orgId = String(application?.drive?.orgId || "");
            if (orgId) {
                const recordingSettings = await getOrgRecordingSettings(orgId);
                if (!recordingSettings.recordingEnabled) {
                    return NextResponse.json({
                        error: "Recording is disabled for this organization.",
                        code: "RECORDING_DISABLED",
                    }, { status: 403 });
                }
            }
            // Idempotency: if an egress is already active, do not create another.
            let active = null;
            try {
                active = await findActiveEgressForRoom(egressClient, roomName);
            } catch (err) {
                console.warn("[EGRESS] Could not list active egress before start:", err);
            }
            if (active) {
                await persistRecordingState({
                    applicationId,
                    status: statusToLabel(active.status),
                    mimeType: "video/mp4",
                    startedAt: new Date(),
                    recordingName,
                    manifest: {
                        mode: "livekit_egress",
                        roomName,
                        egressId: active.egressId,
                        startedAt: new Date().toISOString(),
                        lastError: null,
                    },
                }).catch(() => {});
                return NextResponse.json({
                    success: true,
                    action,
                    started: false,
                    alreadyActive: true,
                    roomName,
                    egressId: active.egressId,
                    status: statusToLabel(active.status),
                });
            }
            const recordingKey = `interview/${orgSlug}/${driveTitle}/${safeCandidate}/recordings/${Date.now()}-interview-${applicationId}.mp4`;
            const recordingUrl = buildPublicInterviewUrl(recordingKey);
            const startedAt = new Date();
            try {
                const encodedOutput: any = {
                    file: {
                        filepath: recordingKey,
                        disableManifest: true,
                        output: {
                            case: "s3",
                            value: {
                                accessKey: r2AccessKey,
                                secret: r2SecretKey,
                                endpoint: r2Endpoint,
                                region: "auto",
                                bucket: r2InterviewBucket,
                                forcePathStyle: true,
                            },
                        },
                    },
                };
                const info = await egressClient.startRoomCompositeEgress(
                    roomName,
                    encodedOutput,
                    { layout: "speaker-light" }
                );
                await persistRecordingState({
                    applicationId,
                    status: statusToLabel(info.status),
                    mimeType: "video/mp4",
                    startedAt,
                    recordingUrl: recordingUrl || null,
                    recordingKey,
                    recordingName,
                    manifest: {
                        mode: "livekit_egress",
                        roomName,
                        egressId: info.egressId,
                        recordingKey,
                        recordingUrl: recordingUrl || undefined,
                        startedAt: startedAt.toISOString(),
                        stoppedAt: null,
                        stopRequestedAt: null,
                        lastStatus: statusToLabel(info.status),
                        lastError: null,
                    },
                });
                return NextResponse.json({
                    success: true,
                    action,
                    started: true,
                    roomName,
                    egressId: info.egressId,
                    status: statusToLabel(info.status),
                    recordingUrl: recordingUrl || null,
                    recordingKey,
                });
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err || "Unknown egress start error");
                await persistRecordingState({
                    applicationId,
                    status: "FAILED",
                    recordingName,
                    recordingKey,
                    manifest: {
                        mode: "livekit_egress",
                        roomName,
                        recordingKey,
                        recordingUrl: recordingUrl || undefined,
                        startedAt: startedAt.toISOString(),
                        lastError: message,
                    },
                }).catch(() => {});
                return NextResponse.json({
                    error: "Failed to start LiveKit egress",
                    details: message,
                }, { status: 500 });
            }
        }
        // action === "stop"
        const manifestEgressId = String(manifest.egressId || "").trim();
        const recordingKey = String(manifest.recordingKey || "").trim();
        const recordingUrl = String(manifest.recordingUrl || "").trim();
        const startedAt = manifest.startedAt ? new Date(manifest.startedAt) : null;
        const now = new Date();
        if (!manifestEgressId) {
            // Idempotent no-op when start was never completed.
            await persistRecordingState({
                applicationId,
                status: "ABORTED",
                completedAt: now,
                mimeType: "video/mp4",
                recordingKey: recordingKey || null,
                manifest: {
                    ...manifest,
                    stopRequestedAt: now.toISOString(),
                    stoppedAt: now.toISOString(),
                    lastError: "No egress id found while stopping.",
                },
            }).catch(() => {});
            return NextResponse.json({
                success: true,
                action,
                stopped: false,
                skipped: true,
                reason: "No active egress id on record",
            });
        }
        try {
            const stopInfo = await egressClient.stopEgress(manifestEgressId);
            const statusLabel = statusToLabel(stopInfo.status);
            await persistRecordingState({
                applicationId,
                status: statusLabel,
                completedAt: statusLabel === "COMPLETE" ? now : null,
                mimeType: "video/mp4",
                recordingUrl: recordingUrl || null,
                recordingKey: recordingKey || null,
                durationSec: startedAt ? Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 1000)) : null,
                manifest: {
                    ...manifest,
                    stopRequestedAt: now.toISOString(),
                    stoppedAt: now.toISOString(),
                    lastStatus: statusLabel,
                    lastError: stopInfo.error || null,
                },
            });
            // Background finalize job: verify file landed in R2 and persist final status/url.
            let jobId: string | number | undefined;
            try {
                const job = await interviewRecordingQueue.add(
                    "finalize-egress-recording",
                    {
                        applicationId,
                        egressId: manifestEgressId,
                        recordingKey: recordingKey || null,
                        recordingUrl: recordingUrl || null,
                        startedAt: manifest.startedAt || null,
                        requestedAt: now.toISOString(),
                        mimeType: "video/mp4",
                    },
                    {
                        attempts: 6,
                        delay: 15000,
                        backoff: { type: "exponential", delay: 5000 },
                        removeOnComplete: true,
                        removeOnFail: { count: 20 },
                    }
                );
                jobId = job.id;
            } catch (queueErr) {
                console.warn("[EGRESS] finalize queue enqueue failed:", queueErr);
            }
            return NextResponse.json({
                success: true,
                action,
                stopped: true,
                roomName,
                egressId: manifestEgressId,
                status: statusLabel,
                recordingUrl: recordingUrl || null,
                finalizeQueued: Boolean(jobId),
                jobId: jobId ?? null,
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err || "Unknown egress stop error");
            await persistRecordingState({
                applicationId,
                status: "FAILED",
                completedAt: now,
                mimeType: "video/mp4",
                recordingUrl: recordingUrl || null,
                recordingKey: recordingKey || null,
                manifest: {
                    ...manifest,
                    stopRequestedAt: now.toISOString(),
                    lastError: message,
                },
            }).catch(() => {});
            return NextResponse.json({
                error: "Failed to stop LiveKit egress",
                details: message,
            }, { status: 500 });
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error || "Unknown error");
        console.error("[INTERVIEW_EGRESS_API_ERROR]:", error);
        return NextResponse.json({ error: "Failed to process egress request", details: message }, { status: 500 });
    }
}
