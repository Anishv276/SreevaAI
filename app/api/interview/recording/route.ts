import { NextResponse } from "next/server";
import { deleteObject, getKeyFromUrl, getObjectBuffer, listObjects, putObject } from "@/lib/s3";
import { interviewFinalizationQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { isInterviewTokenRequired } from "@/lib/interview-access";

export const runtime = "nodejs";

const INTERVIEW_CANDIDATES_PREFIX = "candidates";
const MAX_RECORDING_BYTES = 250 * 1024 * 1024; // 250MB
const MAX_CHUNK_BYTES = 32 * 1024 * 1024; // 32MB

type RecordingCompletePayload = {
    applicationId: string;
    recordingUrl: string;
    durationSec: number | null;
    mimeType: string | null;
    startedAt: Date | null;
    completedAt: Date;
};

type ChunkEvent = {
    chunkIndex: number;
    startedAt: string | null;
    endedAt: string | null;
    byteSize: number;
    chunkUrl?: string;
};

type RecordingManifest = {
    sessionId?: string;
    mimeType?: string;
    startedAt?: string | null;
    completedAt?: string | null;
    lastStatus?: string;
    chunksReceived?: number;
    totalByteSize?: number;
    uploadCompleted?: boolean;
    mergeStarted?: boolean;
    mergeFinished?: boolean;
    lastChunkIndex?: number;
    chunkEvents?: ChunkEvent[];
    lastError?: string | null;
};

function sortChunkKeys(keys: string[]): string[] {
    return [...keys].sort((a, b) => {
        const aMatch = a.match(/part-(\d+)\.webm$/i);
        const bMatch = b.match(/part-(\d+)\.webm$/i);
        const aNum = aMatch ? Number.parseInt(aMatch[1], 10) : Number.MAX_SAFE_INTEGER;
        const bNum = bMatch ? Number.parseInt(bMatch[1], 10) : Number.MAX_SAFE_INTEGER;
        return aNum - bNum;
    });
}

type ResolvedChunkSource = {
    keys: string[];
    sessionId: string | null;
};

async function resolveChunkKeys(params: {
    bucket: string;
    applicationId: string;
    safeCandidate: string;
    sessionId?: string | null;
    chunkUrls?: string[];
    chunkKeys?: string[];
    chunkCount?: number | null;
}): Promise<ResolvedChunkSource> {
    const { bucket, applicationId, safeCandidate } = params;
    const explicitKeys = sortChunkKeys((params.chunkKeys || []).filter(Boolean));
    if (explicitKeys.length) {
        return { keys: explicitKeys, sessionId: params.sessionId || null };
    }

    const explicitFromUrls = sortChunkKeys(
        (params.chunkUrls || [])
            .map((url) => getKeyFromUrl(url))
            .filter((key): key is string => Boolean(key))
    );
    if (explicitFromUrls.length) {
        return { keys: explicitFromUrls, sessionId: params.sessionId || null };
    }

    const manifest = await getManifest(applicationId).catch(() => ({} as RecordingManifest));
    const manifestKeys = sortChunkKeys(
        (manifest.chunkEvents || [])
            .map((event) => getKeyFromUrl(String(event.chunkUrl || "")))
            .filter((key): key is string => Boolean(key))
    );
    if (manifestKeys.length) {
        return { keys: manifestKeys, sessionId: manifest.sessionId || params.sessionId || null };
    }

    const prefix = `${INTERVIEW_CANDIDATES_PREFIX}/${safeCandidate}/recordings/.chunks/`;
    const objects = await listObjects(bucket, prefix);
    const sessions = new Map<string, { keys: string[]; lastModified: number }>();

    for (const object of objects) {
        const sessionMatch = object.key.match(/\/recordings\/\.chunks\/([^/]+)\//);
        if (!sessionMatch) continue;
        const sessionKey = sessionMatch[1];
        const current = sessions.get(sessionKey) || { keys: [], lastModified: 0 };
        current.keys.push(object.key);
        const modified = object.lastModified ? object.lastModified.getTime() : 0;
        current.lastModified = Math.max(current.lastModified, modified);
        sessions.set(sessionKey, current);
    }

    if (!sessions.size) {
        const fallbackPrefix = params.sessionId
            ? `${prefix}${params.sessionId}/`
            : prefix;
        const fallbackObjects = await listObjects(bucket, fallbackPrefix);
        const fallbackKeys = sortChunkKeys(fallbackObjects.map((item) => item.key));
        return { keys: fallbackKeys, sessionId: params.sessionId || null };
    }

    const bestSession = Array.from(sessions.entries()).sort((a, b) => {
        const countDiff = b[1].keys.length - a[1].keys.length;
        if (countDiff !== 0) return countDiff;
        return b[1].lastModified - a[1].lastModified;
    })[0];

    return {
        keys: sortChunkKeys(bestSession[1].keys),
        sessionId: bestSession[0],
    };
}

function buildCandidateRoleFolder(fullName?: string | null, roleTitle?: string | null, fallbackId?: string) {
    const raw = [fullName, roleTitle].filter(Boolean).join(" - ") || fallbackId || "candidate";
    return raw
        .replace(/[^a-zA-Z0-9_\- ]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .toLowerCase();
}

async function uploadWithRetry(
    bucket: string,
    key: string,
    buffer: Buffer,
    contentType: string,
    maxAttempts = 3
) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const url = await putObject(bucket, key, buffer, contentType);
            return url;
        } catch (error: unknown) {
            lastError = error;
            const code =
                typeof error === "object" && error !== null && "code" in error
                    ? String((error as { code?: string }).code || "").toUpperCase()
                    : "";
            const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
            const isTransient =
                code === "ECONNRESET" ||
                code === "ETIMEDOUT" ||
                code === "ECONNREFUSED" ||
                message.includes("aborted") ||
                message.includes("socket") ||
                message.includes("timeout");

            if (!isTransient || attempt === maxAttempts) {
                throw error;
            }

            await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        }
    }

    throw lastError;
}

function parsePositiveInt(value: unknown): number | null {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

function parseDateValue(value: unknown): Date | null {
    if (!value) return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return null;
    return date;
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

async function getCandidateFolder(applicationId: string) {
    const candidate = await prisma.application.findUnique({
        where: { id: applicationId },
        select: {
            fullName: true,
            drive: { select: { title: true } },
        },
    });
    return buildCandidateRoleFolder(candidate?.fullName, candidate?.drive?.title, applicationId);
}

function normalizeManifest(raw: unknown): RecordingManifest {
    if (!raw) return {};
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === "object") ? parsed as RecordingManifest : {};
        } catch {
            return {};
        }
    }
    if (typeof raw === "object") return raw as RecordingManifest;
    return {};
}

async function getManifest(applicationId: string): Promise<RecordingManifest> {
    const rows = await prisma.$queryRaw<Array<{ recordingManifest: unknown }>>`
        SELECT "recordingManifest" FROM "Interview" WHERE "applicationId" = ${applicationId} LIMIT 1
    `;
    return normalizeManifest(rows?.[0]?.recordingManifest);
}

async function updateRecordingState(params: {
    applicationId: string;
    status: "STARTED" | "CHUNKING" | "FINALIZING" | "COMPLETED" | "FAILED" | "ABANDONED";
    mimeType?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    durationSec?: number | null;
    manifest?: RecordingManifest;
    error?: string | null;
}) {
    const {
        applicationId,
        status,
        mimeType = null,
        startedAt = null,
        completedAt = null,
        durationSec = null,
        manifest,
        error = null,
    } = params;

    const currentManifest = await getManifest(applicationId);
    const nextManifest: RecordingManifest = {
        ...currentManifest,
        ...(manifest || {}),
        lastStatus: status,
        lastError: error,
    };

    await prisma.$executeRawUnsafe(
        `UPDATE "Interview"
         SET "recordingStatus" = $1::text,
             "recordingMimeType" = COALESCE($2::text, "recordingMimeType"),
             "recordingStartedAt" = COALESCE("recordingStartedAt", $3::timestamp),
             "recordingCompletedAt" = CASE WHEN $4::timestamp IS NOT NULL THEN $4::timestamp ELSE "recordingCompletedAt" END,
             "recordingDurationSec" = CASE WHEN $5::integer IS NOT NULL THEN $5::integer ELSE "recordingDurationSec" END,
             "recordingManifest" = $6::jsonb,
             "updatedAt" = NOW()
         WHERE "applicationId" = $7::text`,
        status,
        mimeType,
        startedAt,
        completedAt,
        durationSec,
        JSON.stringify(nextManifest),
        applicationId
    );
}

async function tryUpdateRecordingState(params: Parameters<typeof updateRecordingState>[0]) {
    try {
        await updateRecordingState(params);
    } catch (error) {
        // Recording data should never be dropped due to metadata/schema drift.
        console.warn("[RECORDING] Non-fatal state update failure:", error);
    }
}

async function persistRecordingComplete(payload: RecordingCompletePayload) {
    const { applicationId, recordingUrl, durationSec, mimeType, startedAt, completedAt } = payload;

    await prisma.interview.upsert({
        where: { applicationId },
        update: {
            status: "COMPLETED",
            interviewRecordingUrl: recordingUrl,
            interviewRecordedAt: completedAt,
            interviewDuration: durationSec,
            completedAt,
            updatedAt: new Date(),
        },
        create: {
            id: crypto.randomUUID(),
            applicationId,
            accessToken: crypto.randomUUID(),
            status: "COMPLETED",
            interviewRecordingUrl: recordingUrl,
            interviewRecordedAt: completedAt,
            interviewDuration: durationSec,
            completedAt,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    await tryUpdateRecordingState({
        applicationId,
        status: "COMPLETED",
        mimeType,
        startedAt,
        completedAt,
        durationSec,
        manifest: {
            uploadCompleted: true,
            mergeFinished: true,
            completedAt: completedAt.toISOString(),
        },
    });

    await prisma.application.update({
        where: { id: applicationId },
        data: {
            interviewStatus: "COMPLETED",
            updatedAt: new Date(),
        },
    });
}

export async function POST(req: Request) {
    try {
        const contentType = req.headers.get("content-type") || "";
        const contentLength = req.headers.get("content-length") || "unknown";
        console.log(`[RECORDING_API] Incoming Request: ${contentType}, length: ${contentLength}`);

        const bucket = process.env.R2_INTERVIEW_BUCKET || "interview";
        const requireInterviewToken = isInterviewTokenRequired();
        let jobId: string | number | undefined;

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const uploadType = String(formData.get("uploadType") || "full").trim().toLowerCase();
            const applicationId = String(formData.get("applicationId") || "").trim();
            const interviewToken = String(formData.get("interviewToken") || "").trim();
            const recording = formData.get("recording") as File | null;
            const durationSec = parsePositiveInt(formData.get("duration"));
            const mimeType = String(formData.get("mimeType") || recording?.type || "video/webm").trim() || "video/webm";
            const startedAt = parseDateValue(formData.get("startedAt"));

            if (!applicationId || !recording) {
                return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
            }
            if (!(await authenticateInterview(applicationId, interviewToken, requireInterviewToken))) {
                return NextResponse.json({ error: "Unauthorized: Invalid session token" }, { status: 401 });
            }
            if (recording.size <= 0) {
                return NextResponse.json({ error: "Recording file is empty" }, { status: 400 });
            }
            const sizeLimit = uploadType === "chunk" ? MAX_CHUNK_BYTES : MAX_RECORDING_BYTES;
            if (recording.size > sizeLimit) {
                return NextResponse.json({ error: "Recording payload too large" }, { status: 413 });
            }

            const bytes = await recording.arrayBuffer();
            const buffer = Buffer.from(bytes);
            const safeCandidate = await getCandidateFolder(applicationId);

            if (uploadType === "chunk") {
                const sessionId = String(formData.get("sessionId") || "").trim();
                const chunkIndex = parsePositiveInt(formData.get("chunkIndex"));
                const chunkStartedAt = parseDateValue(formData.get("chunkStartedAt"));
                const chunkEndedAt = parseDateValue(formData.get("chunkEndedAt"));
                const byteSize = parsePositiveInt(formData.get("byteSize")) ?? recording.size;
                if (!sessionId || chunkIndex === null) {
                    return NextResponse.json({ error: "Missing chunk session or chunk index" }, { status: 400 });
                }

                const chunkKey = `${INTERVIEW_CANDIDATES_PREFIX}/${safeCandidate}/recordings/.chunks/${sessionId}/part-${String(chunkIndex).padStart(6, "0")}.webm`;
                const chunkUrl = await uploadWithRetry(bucket, chunkKey, buffer, mimeType);

                await prisma.interview.upsert({
                    where: { applicationId },
                    update: {
                        status: "IN_PROGRESS",
                        updatedAt: new Date(),
                    },
                    create: {
                        id: crypto.randomUUID(),
                        applicationId,
                        accessToken: crypto.randomUUID(),
                        status: "IN_PROGRESS",
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    },
                });

                try {
                    const currentManifest = await getManifest(applicationId);
                    const currentEvents = Array.isArray(currentManifest.chunkEvents) ? currentManifest.chunkEvents : [];
                    const nextEvent: ChunkEvent = {
                        chunkIndex,
                        startedAt: chunkStartedAt ? chunkStartedAt.toISOString() : null,
                        endedAt: chunkEndedAt ? chunkEndedAt.toISOString() : null,
                        byteSize,
                        chunkUrl,
                    };
                    const mergedEvents = [...currentEvents, nextEvent].slice(-300);
                    const totalByteSize = (currentManifest.totalByteSize || 0) + byteSize;
                    const chunksReceived = (currentManifest.chunksReceived || 0) + 1;
                    await tryUpdateRecordingState({
                        applicationId,
                        status: "CHUNKING",
                        mimeType,
                        startedAt,
                        manifest: {
                            sessionId,
                            mimeType,
                            startedAt: (startedAt || new Date()).toISOString(),
                            chunksReceived,
                            totalByteSize,
                            lastChunkIndex: chunkIndex,
                            chunkEvents: mergedEvents,
                            uploadCompleted: false,
                            mergeStarted: false,
                            mergeFinished: false,
                        },
                    });
                } catch (stateErr) {
                    console.warn("[RECORDING] chunk metadata update skipped:", stateErr);
                }

                return NextResponse.json({
                    success: true,
                    uploadType: "chunk",
                    sessionId,
                    chunkIndex,
                    chunkUrl,
                    chunkKey,
                });
            }

            // Legacy full upload path remains as fallback.
            const safeName = (recording.name || "interview.webm").replace(/[^a-zA-Z0-9._-]/g, "_");
            const recordingKey = `${INTERVIEW_CANDIDATES_PREFIX}/${safeCandidate}/recordings/${Date.now()}-${safeName}`;
            const uploadedUrl = await uploadWithRetry(bucket, recordingKey, buffer, mimeType);
            const recordingUrl = typeof uploadedUrl === "string" ? uploadedUrl : "";
            if (!recordingUrl) {
                return NextResponse.json({ error: "Recording upload did not return a URL" }, { status: 500 });
            }

            const completedAt = new Date();
            await persistRecordingComplete({
                applicationId,
                recordingUrl,
                durationSec,
                mimeType,
                startedAt,
                completedAt,
            });

            try {
                const job = await interviewFinalizationQueue.add(
                    "finalize-interview",
                    { applicationId, recordingUrl },
                    {
                        attempts: 5,
                        backoff: { type: "exponential", delay: 1000 },
                        removeOnComplete: true,
                        removeOnFail: 200,
                    }
                );
                jobId = job.id;
            } catch (jobError) {
                console.warn("[API] Background job queuing failed:", jobError);
            }

            return NextResponse.json({ success: true, uploadType: "full", queued: !!jobId, jobId, recordingUrl, recordingKey });
        } else {
            const body = await req.json();
            const uploadType = String(body?.uploadType || "").trim().toLowerCase();
            const applicationId = String(body?.applicationId || "").trim();
            const interviewToken = String(body?.interviewToken || "").trim();

            if (!applicationId || (requireInterviewToken && !interviewToken)) {
                return NextResponse.json({ error: "Missing required fields (including token)" }, { status: 400 });
            }
            if (!(await authenticateInterview(applicationId, interviewToken, requireInterviewToken))) {
                return NextResponse.json({ error: "Unauthorized: Invalid session token" }, { status: 401 });
            }

            if (uploadType === "abandon") {
                const reason = String(body?.reason || "recording_session_abandoned").slice(0, 200);
                await tryUpdateRecordingState({
                    applicationId,
                    status: "ABANDONED",
                    manifest: {
                        uploadCompleted: false,
                        mergeFinished: false,
                    },
                    error: reason,
                });
                return NextResponse.json({ success: true, uploadType: "abandon" });
            }

            if (uploadType === "started") {
                const sessionId = String(body?.sessionId || "").trim();
                const startedAt = parseDateValue(body?.startedAt) || new Date();
                const mimeType = String(body?.mimeType || "video/webm").trim() || "video/webm";
                await tryUpdateRecordingState({
                    applicationId,
                    status: "STARTED",
                    mimeType,
                    startedAt,
                    manifest: {
                        sessionId,
                        mimeType,
                        startedAt: startedAt.toISOString(),
                        chunksReceived: 0,
                        totalByteSize: 0,
                        uploadCompleted: false,
                        mergeStarted: false,
                        mergeFinished: false,
                    },
                });
                return NextResponse.json({ success: true, uploadType: "started", sessionId });
            }

            if (uploadType === "mark_failed") {
                const reason = String(body?.reason || "recording_failed").slice(0, 200);
                const durationSec = parsePositiveInt(body?.duration);
                const startedAt = parseDateValue(body?.startedAt);
                await tryUpdateRecordingState({
                    applicationId,
                    status: "FAILED",
                    startedAt,
                    completedAt: new Date(),
                    durationSec,
                    error: reason,
                });
                return NextResponse.json({ success: true, uploadType: "mark_failed" });
            }

            if (uploadType !== "finalize_chunks") {
                return NextResponse.json({ error: "Unsupported JSON upload type" }, { status: 400 });
            }

            const sessionId = String(body?.sessionId || "").trim();
            const chunkUrlsRaw = Array.isArray(body?.chunkUrls) ? body.chunkUrls : [];
            const chunkUrls = chunkUrlsRaw.map((value: unknown) => String(value || "").trim()).filter(Boolean);
            const chunkKeysRaw = Array.isArray(body?.chunkKeys) ? body.chunkKeys : [];
            const chunkKeys = chunkKeysRaw.map((value: unknown) => String(value || "").trim()).filter(Boolean);
            const chunkCount = parsePositiveInt(body?.chunkCount);
            const durationSec = parsePositiveInt(body?.duration);
            const mimeType = String(body?.mimeType || "video/webm").trim() || "video/webm";
            const startedAt = parseDateValue(body?.startedAt);
            const completedAt = new Date();

            await tryUpdateRecordingState({
                applicationId,
                status: "FINALIZING",
                mimeType,
                startedAt,
                manifest: {
                    sessionId,
                    mergeStarted: true,
                    uploadCompleted: true,
                },
            });

            const buffers: Buffer[] = [];
            try {
                const safeCandidate = await getCandidateFolder(applicationId);
                const resolved = await resolveChunkKeys({
                    bucket,
                    applicationId,
                    safeCandidate,
                    sessionId,
                    chunkUrls,
                    chunkKeys,
                    chunkCount,
                });
                const resolvedChunkKeys = resolved.keys;
                const effectiveSessionId = resolved.sessionId || sessionId;

                if (!resolvedChunkKeys.length && chunkCount) {
                    const fallbackChunkKeys = Array.from({ length: chunkCount }, (_, index) => (
                        `${INTERVIEW_CANDIDATES_PREFIX}/${safeCandidate}/recordings/.chunks/${effectiveSessionId}/part-${String(index + 1).padStart(6, "0")}.webm`
                    ));
                    resolvedChunkKeys.push(...fallbackChunkKeys);
                }

                if (resolvedChunkKeys.length) {
                    for (const chunkKey of resolvedChunkKeys) {
                        const buf = await getObjectBuffer(bucket, chunkKey);
                        buffers.push(buf);
                    }
                } else {
                    for (const chunkUrl of chunkUrls) {
                        const response = await fetch(chunkUrl);
                        if (!response.ok) {
                            throw new Error(`Failed to fetch recording chunk: ${chunkUrl}`);
                        }
                        const bytes = await response.arrayBuffer();
                        buffers.push(Buffer.from(bytes));
                    }
                }

                if (!buffers.length) {
                    throw new Error("No chunk payloads were available to merge");
                }

                const finalBuffer = Buffer.concat(buffers);
                const finalSessionId = resolved.sessionId || sessionId || crypto.randomUUID();
                const finalKey = `${INTERVIEW_CANDIDATES_PREFIX}/${safeCandidate}/recordings/${Date.now()}-interview-${finalSessionId}.webm`;
                const recordingUrl = await uploadWithRetry(bucket, finalKey, finalBuffer, mimeType);

                await persistRecordingComplete({
                    applicationId,
                    recordingUrl,
                    durationSec,
                    mimeType,
                    startedAt,
                    completedAt,
                });

                // Best-effort chunk cleanup to keep R2 clean.
                const cleanupKeys = new Set<string>();
                chunkUrls.forEach((url: string) => {
                    const key = getKeyFromUrl(url);
                    if (key) cleanupKeys.add(key);
                });
                chunkKeys.forEach((key: string) => {
                    if (key) cleanupKeys.add(key);
                });
                resolvedChunkKeys.forEach((key: string) => {
                    if (key) cleanupKeys.add(key);
                });
                await Promise.all(
                    Array.from(cleanupKeys).map(async (key: string) => {
                        await deleteObject(bucket, key).catch(() => { });
                    })
                );

                try {
                    const job = await interviewFinalizationQueue.add(
                        "finalize-interview",
                        { applicationId, recordingUrl },
                        {
                            attempts: 5,
                            backoff: { type: "exponential", delay: 1000 },
                            removeOnComplete: true,
                            removeOnFail: 200,
                        }
                    );
                    jobId = job.id;
                } catch (jobError) {
                    console.warn("[API] Background job queuing failed:", jobError);
                }

                return NextResponse.json({
                    success: true,
                    uploadType: "finalize_chunks",
                    queued: !!jobId,
                    jobId,
                    recordingUrl,
                    recordingKey: finalKey,
                    chunkCount: buffers.length,
                });
            } catch (finalizeErr: any) {
                await tryUpdateRecordingState({
                    applicationId,
                    status: "FAILED",
                    mimeType,
                    startedAt,
                    completedAt: new Date(),
                    durationSec,
                    manifest: {
                        sessionId,
                        mergeStarted: true,
                        mergeFinished: false,
                    },
                    error: finalizeErr?.message || "chunk_finalize_failed",
                });
                return NextResponse.json(
                    { error: "Failed to finalize chunks", details: finalizeErr?.message || String(finalizeErr) },
                    { status: 500 }
                );
            }
        }
    } catch (error: any) {
        console.error("[API_RECORD_SAVE_ERROR]:", error);
        return NextResponse.json({
            error: "Failed to save recording",
            details: error?.message || String(error),
        }, { status: 500 });
    }
}
