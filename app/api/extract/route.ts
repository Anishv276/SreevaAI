import { NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import { extractJDFromText } from "@/lib/openai";
import { z } from "zod";
import { extractionLimiter } from "@/lib/rate-limit";
import { getSession } from "@/lib/auth";
import { recordOrgBillingUsage } from "@/lib/usage-metrics";
import { prisma } from "@/lib/prisma";

const extractQuerySchema = z.object({
    type: z.enum(["JD", "RESUME", "PASSPORT"]),
    url: z.string().url().optional(),
});

export async function POST(request: Request) {
    try {
        // ── RATE LIMITING ───────────────────
        const ip = request.headers.get("x-forwarded-for") || "unknown";
        const { success, remaining, reset } = await extractionLimiter.check(ip);
        
        if (!success) {
            return NextResponse.json({ 
                error: "Too many extraction attempts. Please try again later.",
                code: "RATE_LIMIT_EXCEEDED",
                resetAt: new Date(reset).toISOString()
            }, { 
                status: 429,
                headers: {
                    'X-RateLimit-Limit': '10000',
                    'X-RateLimit-Remaining': remaining.toString(),
                    'X-RateLimit-Reset': reset.toString()
                }
            });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const url = formData.get("url") as string | null;
        const typeRaw = formData.get("type") as string | null;
        const explicitOrgId = formData.get("orgId") as string | null;
        let sessionOrgId: string | null = null;
        try {
            const session = await getSession();
            sessionOrgId = session?.orgId || null;
        } catch {
            sessionOrgId = null;
        }
        const orgId = explicitOrgId || sessionOrgId;
        let orgOpenAIModel = "gpt-4o-mini";
        if (orgId) {
            const orgConfig = await prisma.organization.findUnique({
                where: { id: orgId },
                select: { llmProvider: true, llmModel: true },
            });
            if ((orgConfig?.llmProvider || "OPENAI") === "OPENAI" && orgConfig?.llmModel) {
                orgOpenAIModel = orgConfig.llmModel;
            }
        }

        if (!file && !url) {
            return NextResponse.json({ error: "Missing file or URL" }, { status: 400 });
        }

        if (!typeRaw || !["JD", "RESUME", "PASSPORT"].includes(typeRaw)) {
            return NextResponse.json({ error: "Invalid type. Must be JD, RESUME or PASSPORT" }, { status: 400 });
        }

        const type = typeRaw as "JD" | "RESUME" | "PASSPORT";

        if (url) {
            if (type !== "JD") {
                return NextResponse.json({ error: "URL extraction only supported for JD type" }, { status: 400 });
            }

            try {
                console.log("[SCRAPE_START]: Fetching URL:", url);
                const { load } = await import("cheerio");
                const response = await fetch(url);
                if (!response.ok) {
                    console.error("[SCRAPE_FETCH_FAILED]:", { url, status: response.status });
                    return NextResponse.json({ error: "Failed to fetch URL" }, { status: 400 });
                }
                const html = await response.text();
                const $ = load(html);

                // Remove non-content elements
                $("script, style, nav, footer, header, noscript, iframe").remove();

                const text = $("body")
                    .text()
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 15000); // Increased limit as Cheerio is cleaner

                console.log("[SCRAPE_SUCCESS]: Text extracted, length:", text.length);

                const { data, usage } = await extractJDFromText(text, orgOpenAIModel);
                if (orgId && usage) {
                    await recordOrgBillingUsage({
                        orgId,
                        feature: "jdExtraction",
                        usage,
                    });
                }
                return NextResponse.json({ data, text });
            } catch (err: any) {
                console.error("[SCRAPE_FATAL_ERROR]:", { url, error: err.message });
                return NextResponse.json({ error: "Failed to scrape JD from URL" }, { status: 500 });
            }
        }

        if (!file) {
            return NextResponse.json({ error: "File required" }, { status: 400 });
        }

        // ── SERVER-SIDE VALIDATION ───────────────────────────
        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ 
                error: "File size exceeds 10MB limit.", 
                code: "FILE_TOO_LARGE" 
            }, { status: 413 });
        }

        const allowedTypes = {
            JD: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
            RESUME: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
            PASSPORT: ["image/jpeg", "image/png", "application/pdf", "image/webp"]
        };

        const currentAllowed = allowedTypes[type as keyof typeof allowedTypes] || [];
        const isMimeAllowed = currentAllowed.some(t => file.type.includes(t) || (t.endsWith("/*") && file.type.startsWith(t.split("/")[0])));
        
        if (!isMimeAllowed) {
             // Fallback: check extension if MIME is missing
             const validExts = type === "PASSPORT" ? /\.(jpg|jpeg|png|pdf|webp)$/i : /\.(pdf|docx|txt)$/i;
             if (!file.name.match(validExts)) {
                return NextResponse.json({ 
                    error: `Invalid file type for ${type}.`, 
                    code: "INVALID_FILE_TYPE" 
                }, { status: 415 });
             }
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const byteLength = buffer.length;
        const tempDir = os.tmpdir();
        const tempFilePath = join(tempDir, `${uuidv4()}-${file.name}`);
        await writeFile(tempFilePath, buffer);

        console.log("[FILE_EXTRACT_START]:", { name: file.name, size: byteLength, type });

        let outputData = "";
        let errorData = "";

        const bucket = type === "JD" 
            ? (process.env.R2_JDS_BUCKET || "jds")
            : type === "PASSPORT"
                ? (process.env.R2_PASSPHOTO_BUCKET || "passportphoto")
                : (process.env.R2_RESUMES_BUCKET || "resumes");

        const prefix = type === "JD" ? "jds/" : type === "PASSPORT" ? "passport/" : "resumes/";
        const fileName = `${prefix}${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

        let fileUrl: string | null = null;

        console.log("[PYTHON_EXEC]: Starting scripts/extract_pdf.py for", file.name);
        const pythonCommand = process.platform === "win32" ? "python" : "python3";
        const pythonProcess = spawn(pythonCommand, ["scripts/extract_pdf.py", tempFilePath, type, orgOpenAIModel]);

        pythonProcess.stdout.on("data", (data) => { outputData += data.toString(); });
        pythonProcess.stderr.on("data", (data) => { errorData += data.toString(); });

        // R2 upload and Python extraction run in parallel — they don't depend on each other
        const [exitCode] = await Promise.all([
            // Python PDF/LLM extraction
            new Promise<number>((resolve) => {
                let settled = false;

                // Safety timeout: 120s — OpenAI itself can take 30-40s on large prompts
                const timeout = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    console.error("[PYTHON_TIMEOUT]: Process exceeded 120s, killing.");
                    pythonProcess.kill();
                    resolve(-1);
                }, 120000);

                pythonProcess.on("close", (code) => {
                    if (settled) return; // Timeout already resolved — ignore late close event
                    settled = true;
                    clearTimeout(timeout);
                    console.log("[PYTHON_EXTRACT_END]: Exit code", code);
                    resolve(code ?? 1);
                });
            }),
            // R2 upload (runs concurrently)
            (async () => {
                try {
                    console.log("[STORAGE_PUSH]: Uploading to R2", fileName);
                    const { putObject } = await import("@/lib/s3");
                    fileUrl = await putObject(bucket, fileName, buffer, file.type);
                    console.log("[STORAGE_SUCCESS]:", { type, fileName, url: fileUrl });
                } catch (storageErr: any) {
                    console.error("[STORAGE_FATAL_ERROR]:", { type, fileName, error: storageErr.message });
                    if (type === "JD") {
                        throw { code: "STORAGE_VULNERABILITY", message: storageErr.message };
                    }
                }
            })(),
        ]);

        // Cleanup temp file (after upload is attempted)
        await unlink(tempFilePath).catch(() => { });

        if (type === "PASSPORT") {
            if (!fileUrl) {
                console.error("[PASSPORT_ERROR]: Storage failed for identity document");
                return NextResponse.json({ 
                    error: "Passport security dispatch failed. Identity persistence incomplete.", 
                    code: "STORAGE_VULNERABILITY" 
                }, { status: 507 });
            }
            return NextResponse.json({ url: fileUrl });
        }

        if (exitCode !== 0) {
            console.error("[EXTRACTION_FAILED]: Python script returned non-zero exit code", { exitCode, errorData });
            return NextResponse.json({
                error: "Document processing failed. The file format might be unsupported or corrupted.",
                code: "EXTRACTION_PROCESS_ERROR",
                details: errorData
            }, { status: 502 });
        }

        try {
            const result = JSON.parse(outputData);

            // Check if Python returned an error object
            if (result.error) {
                console.error("[EXTRACTION_PYTHON_ERROR]:", result);
                return NextResponse.json({
                    error: result.error,
                    code: result.code || "EXTRACTION_ERROR"
                }, { status: 422 });
            }

            // Guard: ensure we got meaningful text back for JD/RESUME types
            if (type !== "PASSPORT" && result.text && result.text.length < 100) {
                return NextResponse.json({
                    error: "Could not extract sufficient text from this document. Please ensure the file is not empty or a scanned image.",
                    code: "EXTRACTION_INSUFFICIENT_DATA"
                }, { status: 422 });
            }

            const feature = type === "JD" ? "jdExtraction" : type === "RESUME" ? "resumeExtraction" : null;
            if (feature && orgId && result.usage) {
                await recordOrgBillingUsage({
                    orgId,
                    feature,
                    usage: {
                        model: result.usage.model || "gpt-4o-mini",
                        inputTokens: result.usage.inputTokens || 0,
                        outputTokens: result.usage.outputTokens || 0,
                        cachedInputTokens: result.usage.cachedInputTokens || 0,
                    },
                });
            }

            return NextResponse.json({
                ...result,
                url: fileUrl || null  // null if R2 upload failed (only for non-critical assets)
            });
        } catch (e: any) {
            const preview = outputData.length > 200 ? outputData.slice(0, 200) + "..." : outputData;
            console.error("[EXTRACTION_PARSE_FATAL]: Received invalid JSON from Python", { preview, error: e.message });
            return NextResponse.json({
                error: "Received invalid data format from processing engine.",
                code: "MALFORMED_RESPONSE_ERROR"
            }, { status: 502 });
        }

    } catch (error: any) {
        console.error("General Extraction Error:", error);
        return NextResponse.json({ 
            error: "An unexpected error occurred while processing your request.",
            code: "INTERNAL_SERVER_ERROR",
            details: error.message 
        }, { status: 500 });
    }
}
