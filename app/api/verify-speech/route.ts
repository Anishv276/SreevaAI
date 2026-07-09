import { NextRequest, NextResponse } from "next/server";
import { DeepgramClient } from "@deepgram/sdk";
import { prisma } from "@/lib/prisma";
import { recordOrgBillingUsage } from "@/lib/usage-metrics";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { isRateLimited } from "@/lib/rate-limit";
const DEEPGRAM_VERIFY_MODEL = "flux-general-en";
const FLUX_VERIFY_MIN_TIMEOUT_MS = 10000;
const FLUX_VERIFY_TIMEOUT_PADDING_MS = 6000;
const FLUX_AUDIO_SAMPLE_RATE = 16000;
const FLUX_AUDIO_CHUNK_BYTES = 2560; // 80ms of 16-bit mono PCM at 16kHz.
const FLUX_AUDIO_CHUNK_DURATION_MS = 80;
const MAX_VERIFY_AUDIO_BYTES = 1 * 1024 * 1024;
type FluxMessage = {
    type?: string;
    event?: string;
    request_id?: string;
    transcript?: string;
    audio_window_end?: number;
    code?: string;
    description?: string;
};
type FluxConnection = {
    on(event: "message", callback: (message: FluxMessage) => void): void;
    on(event: "error", callback: (error: Error) => void): void;
    on(event: "close", callback: () => void): void;
    connect(): unknown;
    waitForOpen(): Promise<unknown>;
    sendMedia(message: ArrayBuffer): void;
    sendCloseStream(message: { type: "CloseStream" }): void;
    close(): void;
};
async function transcribeWithFlux(audioBuffer: ArrayBuffer, apiKey: string): Promise<{
    transcript: string;
    durationSeconds: number;
    requestId: string;
}> {
    const client = new DeepgramClient();
    const abortController = new AbortController();
    let connection: FluxConnection | null = null;
    let resolved = false;
    const transcriptParts: string[] = [];
    let durationSeconds = 0;
    let requestId = "";
    const audioDurationMs = Math.ceil((audioBuffer.byteLength / (FLUX_AUDIO_SAMPLE_RATE * 2)) * 1000);
    const timeoutMs = Math.max(FLUX_VERIFY_MIN_TIMEOUT_MS, audioDurationMs + FLUX_VERIFY_TIMEOUT_PADDING_MS);
    return await new Promise(async (resolve, reject) => {
        const finish = (error?: Error) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeoutId);
            try {
                connection?.close();
            } catch {
                // Ignore close failures after terminal Deepgram events.
            }
            if (error) {
                reject(error);
                return;
            }
            const fallbackDurationSeconds = audioBuffer.byteLength / (FLUX_AUDIO_SAMPLE_RATE * 2);
            resolve({
                transcript: transcriptParts.join(" ").replace(/\s+/g, " ").trim(),
                durationSeconds: durationSeconds || fallbackDurationSeconds,
                requestId,
            });
        };
        const timeoutId = setTimeout(() => {
            abortController.abort();
            finish(new Error("timeout"));
        }, timeoutMs);
        try {
            connection = await client.listen.v2.connect({
                model: DEEPGRAM_VERIFY_MODEL,
                encoding: "linear16",
                sample_rate: FLUX_AUDIO_SAMPLE_RATE,
                eot_threshold: 0.7,
                eot_timeout_ms: 1000,
                mip_opt_out: true,
                Authorization: `Token ${apiKey}`,
                abortSignal: abortController.signal,
                connectionTimeoutInSeconds: 5,
                reconnectAttempts: 0,
            }) as FluxConnection;
            connection.on("message", (message) => {
                if (message.request_id) requestId = message.request_id;
                if (typeof message.audio_window_end === "number") {
                    durationSeconds = Math.max(durationSeconds, message.audio_window_end);
                }
                if (message.type === "TurnInfo" && message.transcript) {
                    transcriptParts.push(message.transcript);
                    if (message.event === "EndOfTurn") finish();
                    return;
                }
                if (message.type === "Error") {
                    finish(new Error(message.description || message.code || "Deepgram Flux error"));
                }
            });
            connection.on("error", (error) => finish(error));
            connection.on("close", () => finish());
            connection.connect();
            await connection.waitForOpen();
            for (let offset = 0; offset < audioBuffer.byteLength; offset += FLUX_AUDIO_CHUNK_BYTES) {
                connection.sendMedia(audioBuffer.slice(offset, offset + FLUX_AUDIO_CHUNK_BYTES));
                if (offset + FLUX_AUDIO_CHUNK_BYTES < audioBuffer.byteLength) {
                    await new Promise((chunkSent) => setTimeout(chunkSent, FLUX_AUDIO_CHUNK_DURATION_MS));
                }
            }
            connection.sendCloseStream({ type: "CloseStream" });
        } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)));
        }
    });
}
async function validateInterviewAccess(applicationId: string, interviewToken: string) {
    if (!applicationId) return null;
    const app = await prisma.application.findUnique({
        where: { id: applicationId },
        select: {
            drive: { select: { orgId: true } },
            interview: {
                select: {
                    accessToken: true,
                    expiresAt: true,
                    status: true,
                    isTest: true,
                },
            },
        },
    });
    if (!app?.drive?.orgId || !app.interview) {
        console.error("[verify-speech] validateInterviewAccess failed: Missing orgId or interview", { orgId: app?.drive?.orgId, hasInterview: !!app?.interview });
        return null;
    }
    if (isInterviewTokenRequired() && app.interview?.accessToken !== interviewToken) {
        console.error("[verify-speech] validateInterviewAccess failed: Invalid interview token", { required: isInterviewTokenRequired(), expected: app.interview?.accessToken, received: interviewToken });
        return null;
    }

    const isTest = app.interview?.isTest === true;
    const status = String(app.interview.status || "").toUpperCase();
    if (!isTest && (status === "COMPLETED" || status === "FAILED")) {
        console.error("[verify-speech] validateInterviewAccess failed: Interview no longer active");
        return null;
    }
    return app.drive.orgId;
}
export async function POST(req: NextRequest) {
    try {
        const forwardedFor = req.headers.get("x-forwarded-for") || "";
        const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
        if (await isRateLimited(`verify-speech:ip:${ip}`, 30, 60, true)) {
            return NextResponse.json({ error: "Too many speech verification attempts" }, { status: 429 });
        }
        const formData = await req.formData();
        const audio = formData.get("audio") as Blob | null;
        const targetPhrase = (formData.get("targetPhrase") as string | null) ?? "";
        const applicationId = (formData.get("applicationId") as string | null)?.trim() ?? "";
        const interviewToken = (formData.get("interviewToken") as string | null)?.trim() ?? "";
        if (!audio || !targetPhrase.trim() || !applicationId) {
            return NextResponse.json({ error: "Missing audio, targetPhrase, or applicationId" }, { status: 400 });
        }
        if (isInterviewTokenRequired() && !interviewToken) {
            return NextResponse.json({ error: "Missing interview token" }, { status: 401 });
        }
        if (audio.size > MAX_VERIFY_AUDIO_BYTES) {
            return NextResponse.json({ error: "Audio file is too large" }, { status: 413 });
        }
        if (await isRateLimited(`verify-speech:application:${applicationId}`, 10, 60, true)) {
            return NextResponse.json({ error: "Too many speech verification attempts" }, { status: 429 });
        }
        const orgId = await validateInterviewAccess(applicationId, interviewToken);
        if (!orgId) {
            return NextResponse.json({ error: "Invalid or expired interview token" }, { status: 401 });
        }
        const apiKey = process.env.DEEPGRAM_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Deepgram API key not configured" }, { status: 500 });
        }
        const audioBuffer = await audio.arrayBuffer();
        let fluxResult: Awaited<ReturnType<typeof transcribeWithFlux>>;
        try {
            fluxResult = await transcribeWithFlux(audioBuffer, apiKey);
        } catch (fetchErr) {
            if ((fetchErr as Error)?.message === "timeout" || (fetchErr as Error)?.name === "AbortError") {
                console.warn("[verify-speech] Deepgram Flux request timed out");
                return NextResponse.json({ transcript: "", matched: false, error: "timeout" });
            }
            console.error("[verify-speech] Deepgram Flux error:", fetchErr);
            return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
        }
        console.log("[verify-speech] Deepgram Flux transcript received", {
            length: fluxResult.transcript.length,
            requestId: fluxResult.requestId || null,
        });
        const transcript: string = fluxResult.transcript;
        if (!transcript) {
            console.warn("[verify-speech] Empty transcript from Deepgram");
            return NextResponse.json({ transcript: "", matched: false, error: "empty_transcript" });
        }
        // Expand contractions so "i'm" → "i am", "i've" → "i have" etc.
        const expand = (s: string) => s
            .replace(/i'm/gi, "i am").replace(/i've/gi, "i have").replace(/i'll/gi, "i will")
            .replace(/it's/gi, "it is").replace(/that's/gi, "that is").replace(/can't/gi, "cannot")
            .replace(/won't/gi, "will not").replace(/don't/gi, "do not").replace(/isn't/gi, "is not")
            .replace(/\bm\b/gi, "am"); // "i m" → "i am" (deepgram splits "I'm" into "i m")
        const norm = (s: string) => expand(s).toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
        const spokenNorm = norm(transcript);
        const targetNorm = norm(targetPhrase);
        if (!targetNorm) {
            console.error("[verify-speech] Target phrase normalized to empty");
            return NextResponse.json({ transcript, matched: false, error: "invalid_target_phrase" });
        }
        console.log("[verify-speech] normalized transcript evaluated", {
            spokenWordCount: spokenNorm.split(" ").filter(Boolean).length,
            targetWordCount: targetNorm.split(" ").filter(Boolean).length,
        });
        const targetWords = targetNorm.split(" ").filter(Boolean);
        const spokenWords = spokenNorm.split(" ").filter(Boolean);
        // Ordered subsequence match: every target word must appear in the transcript
        // in the correct order. Works even when Deepgram picks up mic echo causing
        // the transcript to be much longer than the target phrase.
        let spokenIdx = 0;
        let matchedCount = 0;
        for (const tw of targetWords) {
            while (spokenIdx < spokenWords.length && spokenWords[spokenIdx] !== tw) {
                spokenIdx++;
            }
            if (spokenIdx < spokenWords.length) {
                matchedCount++;
                spokenIdx++;
            }
        }
        // Only reject on ratio if the target words weren't found -- a long transcript
        // caused by echo/noise is fine if the candidate actually said the right words.
        const wordRatio = spokenWords.length / Math.max(1, targetWords.length);
        if (wordRatio > 3.5 && matchedCount < Math.ceil(targetWords.length * 0.8)) {
            console.warn("[verify-speech] Transcript too long vs target (possible noise)", { spokenWords: spokenWords.length, targetWords: targetWords.length });
            return NextResponse.json({ transcript, matched: false, matchedCount, total: targetWords.length });
        }
        // 80% threshold -- handles accent/contraction/minor mishearing
        const matched = matchedCount >= Math.ceil(targetWords.length * 0.8);
        console.log("[verify-speech] matched:", matchedCount, "/", targetWords.length, "=>", matched);
        return NextResponse.json({ transcript, matched, matchedCount, total: targetWords.length });
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error("[verify-speech] Unexpected error:", errorMsg, err);
        return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
}
