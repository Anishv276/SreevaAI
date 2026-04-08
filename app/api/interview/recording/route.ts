import { NextResponse } from "next/server";
import { putObject } from "@/lib/s3";
import { interviewFinalizationQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const INTERVIEW_RECORDINGS_PREFIX = "interviews/recordings";

const MAX_RECORDING_BYTES = 250 * 1024 * 1024; // 250MB

async function persistInterviewUpdateRaw(params: {
    applicationId: string;
    recordingUrl?: string;
    transcript?: string;
    interviewStatus?: string;
}) {
    const { applicationId, recordingUrl, transcript, interviewStatus } = params;

    await prisma.$executeRawUnsafe(
        `
        INSERT INTO "Interview" ("applicationId", status, "interviewRecordingUrl", "interviewRecordedAt", "interviewTranscript", "completedAt", "createdAt", "updatedAt")
        VALUES ($1, COALESCE($2, 'IN_PROGRESS'), $3, CASE WHEN $3 IS NOT NULL THEN NOW() ELSE NULL END, $4, CASE WHEN $2 = 'COMPLETED' THEN NOW() ELSE NULL END, NOW(), NOW())
        ON CONFLICT ("applicationId")
        DO UPDATE SET
          status = COALESCE($2, "Interview".status),
          "interviewRecordingUrl" = COALESCE($3, "Interview"."interviewRecordingUrl"),
          "interviewRecordedAt" = CASE
            WHEN $3 IS NOT NULL THEN NOW()
            ELSE "Interview"."interviewRecordedAt"
          END,
          "interviewTranscript" = COALESCE($4, "Interview"."interviewTranscript"),
          "completedAt" = CASE
            WHEN $2 = 'COMPLETED' THEN NOW()
            ELSE "Interview"."completedAt"
          END,
          "updatedAt" = NOW()
        `,
        applicationId,
        interviewStatus || null,
        recordingUrl || null,
        transcript || null
    );

    await prisma.$executeRawUnsafe(
        `
        UPDATE "Assessment"
        SET
          "interviewRecordingUrl" = COALESCE($1, "interviewRecordingUrl"),
          "interviewRecordedAt" = CASE WHEN $1 IS NOT NULL THEN NOW() ELSE "interviewRecordedAt" END,
          "interviewTranscript" = COALESCE($2, "interviewTranscript"),
          status = COALESCE($3, status),
          "completedAt" = CASE WHEN $3 = 'COMPLETED' THEN NOW() ELSE "completedAt" END,
          "updatedAt" = NOW()
        WHERE "applicationId" = $4
        `,
        recordingUrl || null,
        transcript || null,
        interviewStatus || null,
        applicationId
    );
}

async function uploadWithRetry(
    key: string,
    buffer: Buffer,
    contentType: string,
    maxAttempts = 3
) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await putObject("resumes", key, buffer, contentType);
            return;
        } catch (error: any) {
            lastError = error;
            const code = String(error?.code || "").toUpperCase();
            const message = String(error?.message || "").toLowerCase();
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

        let applicationId = "";
        let recordingUrl = "";
        let duration: number | null = null;

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
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
            const safeName = (recording.name || "interview.webm").replace(/[^a-zA-Z0-9._-]/g, "_");
            const key = `${INTERVIEW_RECORDINGS_PREFIX}/${applicationId}/${Date.now()}-${safeName}`;

            await uploadWithRetry(key, buffer, recording.type || "video/webm");

            const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
            if (!publicBase) {
                return NextResponse.json({ error: "Missing NEXT_PUBLIC_R2_PUBLIC_URL" }, { status: 500 });
            }

            recordingUrl = `${publicBase.replace(/\/$/, "")}/${key}`;
        } else {
            const body = await req.json();
            applicationId = String(body?.applicationId || "").trim();
            recordingUrl = String(body?.recordingUrl || "").trim();
            if (body?.duration) duration = parseInt(String(body.duration));
        }

        if (!applicationId || !recordingUrl) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        let jobId: string | number | undefined;
        const parsedDuration = duration ? parseInt(String(duration)) : null;
        console.log(`[API] Processing recording for ${applicationId}. Duration: ${parsedDuration}s`);

        // ── Persist immediately, non-blocking ──
        // We intentionally do NOT await here so the response returns fast
        // after the file upload. The DB write runs in the background.
        const persistInBackground = async () => {
            try {
                // The Interview table has NOT NULL: id, applicationId, accessToken, status
                // id must be generated, accessToken can be a placeholder for recording updates
                await prisma.$executeRawUnsafe(
                    `
                    INSERT INTO "Interview" (id, "applicationId", "accessToken", status, "interviewRecordingUrl", "interviewRecordedAt", "interviewDuration", "completedAt", "createdAt", "updatedAt")
                    VALUES (gen_random_uuid()::text, $1, 'recording-upload', 'COMPLETED', $2, NOW(), $3, NOW(), NOW(), NOW())
                    ON CONFLICT ("applicationId")
                    DO UPDATE SET
                        status = 'COMPLETED',
                        "interviewRecordingUrl" = EXCLUDED."interviewRecordingUrl",
                        "interviewRecordedAt" = NOW(),
                        "interviewDuration" = EXCLUDED."interviewDuration",
                        "completedAt" = NOW(),
                        "updatedAt" = NOW()
                    `,
                    applicationId,
                    recordingUrl,
                    isNaN(parsedDuration as number) ? null : parsedDuration
                );
                console.log("[API] Interview DB update successful. Status → COMPLETED.");
            } catch (error) {
                console.error("[API] Interview DB update failed, falling back to Assessment:", error);
                try {
                    await prisma.$executeRawUnsafe(
                        `UPDATE "Assessment" SET "interviewRecordingUrl" = $1, "interviewRecordedAt" = NOW(), "interviewDuration" = $2, status = 'COMPLETED', "completedAt" = NOW(), "updatedAt" = NOW() WHERE "applicationId" = $3`,
                        recordingUrl,
                        isNaN(parsedDuration as number) ? null : parsedDuration,
                        applicationId
                    );
                    console.log("[API] Assessment fallback DB update successful.");
                } catch (err2) {
                    console.error("[API] Assessment fallback also failed:", err2);
                }
            }
        };

        // Fire and forget — don't block the response
        persistInBackground();
        jobId = "persisting-in-background";

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

        return NextResponse.json({ success: true, queued: !!jobId, jobId, recordingUrl });
    } catch (error) {
        console.error("Error saving recording link:", error);
        return NextResponse.json({ error: "Failed to save recording" }, { status: 500 });
    }
}
