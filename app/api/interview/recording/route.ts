import { NextResponse } from "next/server";
import { putObject } from "@/lib/s3";
import { interviewFinalizationQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const runtime = "nodejs";

const INTERVIEW_CANDIDATES_PREFIX = "candidates";

const MAX_RECORDING_BYTES = 250 * 1024 * 1024; // 250MB

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

export async function POST(req: Request) {
    try {
        const contentType = req.headers.get("content-type") || "";
        const contentLength = req.headers.get("content-length") || "unknown";
        console.log(`[RECORDING_API] Incoming Request: ${contentType}, length: ${contentLength}`);

        let applicationId = "";
        let recordingUrl = "";
        let recordingKey = "";
        let duration: number | null = null;

        if (contentType.includes("multipart/form-data")) {
            console.log("[RECORDING_API] Attempting to parse FormData...");
            let formData;
            try {
                formData = await req.formData();
                console.log("[RECORDING_API] FormData parsed successfully.");
            } catch (formError: any) {
                console.error("[RECORDING_API] FormData Parse Critical Failure:", formError);
                return NextResponse.json({ 
                    error: "Failed to parse body as FormData", 
                    details: formError?.message || String(formError),
                    headers: Object.fromEntries(req.headers.entries())
                }, { status: 500 });
            }
            applicationId = String(formData.get("applicationId") || "").trim();
            const recording = formData.get("recording") as File | null;
            const durationStr = formData.get("duration");
            if (durationStr) duration = parseInt(String(durationStr));

            if (!applicationId || !recording) {
                return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
            }

            if (recording.size <= 0) {
                return NextResponse.json({ error: "Recording file is empty" }, { status: 400 });
            }

            if (recording.size > MAX_RECORDING_BYTES) {
                return NextResponse.json({ error: "Recording too large" }, { status: 413 });
            }

            const bytes = await recording.arrayBuffer();
            const buffer = Buffer.from(bytes);
            const candidate = await prisma.application.findUnique({
                where: { id: applicationId },
                select: {
                    fullName: true,
                    drive: { select: { title: true } },
                },
            });

            const safeCandidate = buildCandidateRoleFolder(
                candidate?.fullName,
                candidate?.drive?.title,
                applicationId
            );

            const safeName = (recording.name || "interview.webm").replace(/[^a-zA-Z0-9._-]/g, "_");
            recordingKey = `${INTERVIEW_CANDIDATES_PREFIX}/${safeCandidate}/recordings/${Date.now()}-${safeName}`;

            const bucket = process.env.R2_INTERVIEW_BUCKET || "interview";
            const uploadedUrl = await uploadWithRetry(bucket, recordingKey, buffer, recording.type || "video/webm");
            recordingUrl = typeof uploadedUrl === "string" ? uploadedUrl : "";

            if (!recordingUrl) {
                return NextResponse.json({ error: "Recording upload did not return a URL" }, { status: 500 });
            }
        } else {
            const body = await req.json();
            applicationId = String(body?.applicationId || "").trim();
            recordingUrl = String(body?.recordingUrl || "").trim();
            recordingKey = String(body?.recordingKey || "").trim();
            if (body?.duration) duration = parseInt(String(body.duration));
        }

        if (!applicationId || !recordingUrl) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        let jobId: string | number | undefined;
        const parsedDuration = duration ? parseInt(String(duration)) : null;
        console.log(`[API] Processing recording for ${applicationId}. Duration: ${parsedDuration}s`);

        // Persist DB state with a simple retry loop for database resilience
        const persistWithRetry = async (maxRetries = 3) => {
            const finalDuration = isNaN(parsedDuration as number) ? null : parsedDuration;
            
            for (let i = 0; i < maxRetries; i++) {
                try {
                    // Step 1: Handle Interview Record
                    await prisma.interview.upsert({
                        where: { applicationId },
                        update: {
                            status: 'COMPLETED',
                            interviewRecordingUrl: recordingUrl,
                            interviewRecordedAt: new Date(),
                            interviewDuration: finalDuration,
                            completedAt: new Date(),
                            updatedAt: new Date(),
                        },
                        create: {
                            id: crypto.randomUUID(),
                            applicationId,
                            accessToken: crypto.randomUUID(),
                            status: 'COMPLETED',
                            interviewRecordingUrl: recordingUrl,
                            interviewRecordedAt: new Date(),
                            interviewDuration: finalDuration,
                            completedAt: new Date(),
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    });

                    // Step 2: Update Application Status
                    await prisma.application.update({
                        where: { id: applicationId },
                        data: { 
                            status: 'COMPLETED',
                            updatedAt: new Date(),
                        },
                    });
                    
                    console.log(`[API] Interview DB update successful for ${applicationId}`);
                    return; // Success
                } catch (dbError) {
                    console.error(`[DB_RETRY_${i+1}/${maxRetries}]`, dbError);
                    if (i === maxRetries - 1) throw dbError;
                    await new Promise(r => setTimeout(r, 500 * (i + 1))); // Exponential backoff
                }
            }
        };

        await persistWithRetry();

        // Restore the background job queuing for transcript generation
        try {
            const job = await interviewFinalizationQueue.add(
                "finalize-interview",
                {
                    applicationId,
                    recordingUrl,
                    // Do NOT send interviewStatus: "IN_PROGRESS" here because Python already sets it to COMPLETED.
                },
                {
                    attempts: 5,
                    backoff: { type: "exponential", delay: 1000 },
                    removeOnComplete: 100,
                    removeOnFail: 200,
                }
            );
            jobId = job.id;
            console.log("[API] Background job queued:", jobId);
        } catch (jobError) {
            console.warn("[API] Background job queuing failed:", jobError);
        }

        return NextResponse.json({ success: true, queued: !!jobId, jobId, recordingUrl, recordingKey: recordingKey || null });
    } catch (error: any) {
        console.error("[API_RECORD_SAVE_ERROR]:", error);
        return NextResponse.json({ 
            error: "Failed to save recording", 
            details: error?.message || String(error) 
        }, { status: 500 });
    }
}
