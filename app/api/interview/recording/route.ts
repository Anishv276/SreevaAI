import { NextResponse } from "next/server";
import { deleteObject, getKeyFromUrl, putObject } from "@/lib/s3";
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

    await prisma.$executeRawUnsafe(
        `UPDATE "Interview"
         SET "recordingStatus" = $1,
             "recordingMimeType" = $2,
             "recordingStartedAt" = $3,
             "recordingCompletedAt" = $4,
             "recordingDurationSec" = $5,
             "updatedAt" = NOW()
         WHERE "applicationId" = $6`,
        "COMPLETED",
        mimeType,
        startedAt,
        completedAt,
        durationSec,
        applicationId
    );

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

                await prisma.$executeRawUnsafe(
                    `UPDATE "Interview"
                     SET "recordingStatus" = $1,
                         "recordingMimeType" = $2,
                         "recordingStartedAt" = COALESCE("recordingStartedAt", $3),
                         "updatedAt" = NOW()
                     WHERE "applicationId" = $4`,
                    "UPLOADING",
                    mimeType,
                    startedAt,
                    applicationId
                );

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

            if (uploadType !== "finalize_chunks") {
                return NextResponse.json({ error: "Unsupported JSON upload type" }, { status: 400 });
            }

            const sessionId = String(body?.sessionId || "").trim();
            const chunkUrlsRaw = Array.isArray(body?.chunkUrls) ? body.chunkUrls : [];
            const chunkUrls = chunkUrlsRaw.map((value: unknown) => String(value || "").trim()).filter(Boolean);
            const durationSec = parsePositiveInt(body?.duration);
            const mimeType = String(body?.mimeType || "video/webm").trim() || "video/webm";
            const startedAt = parseDateValue(body?.startedAt);
            const completedAt = new Date();

            if (!sessionId || !chunkUrls.length) {
                return NextResponse.json({ error: "Missing finalize session or chunk URLs" }, { status: 400 });
            }

            const buffers: Buffer[] = [];
            for (const chunkUrl of chunkUrls) {
                const response = await fetch(chunkUrl);
                if (!response.ok) {
                    return NextResponse.json({ error: `Failed to fetch recording chunk: ${chunkUrl}` }, { status: 500 });
                }
                const bytes = await response.arrayBuffer();
                buffers.push(Buffer.from(bytes));
            }

            const finalBuffer = Buffer.concat(buffers);
            const safeCandidate = await getCandidateFolder(applicationId);
            const finalKey = `${INTERVIEW_CANDIDATES_PREFIX}/${safeCandidate}/recordings/${Date.now()}-interview-${sessionId}.webm`;
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
            await Promise.all(
                chunkUrls.map(async (url: string) => {
                    const key = getKeyFromUrl(url);
                    if (!key) return;
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
                chunkCount: chunkUrls.length,
            });
        }
    } catch (error: any) {
        console.error("[API_RECORD_SAVE_ERROR]:", error);
        return NextResponse.json({
            error: "Failed to save recording",
            details: error?.message || String(error),
        }, { status: 500 });
    }
}
