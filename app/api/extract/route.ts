import { NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import { extractJDFromText } from "@/lib/openai";
import { z } from "zod";

const extractQuerySchema = z.object({
    type: z.enum(["JD", "RESUME", "PASSPORT"]),
    url: z.string().url().optional(),
});

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const url = formData.get("url") as string | null;
        const typeRaw = formData.get("type") as string | null;

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
                const response = await fetch(url);
                if (!response.ok) {
                    return NextResponse.json({ error: "Failed to fetch URL" }, { status: 400 });
                }
                const html = await response.text();
                const text = html
                    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
                    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
                    .replace(/<[^>]+>/g, " ")
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 10000);

                const data = await extractJDFromText(text);
                return NextResponse.json({ data, text });
            } catch (err) {
                console.error("URL Extraction Error:", err);
                return NextResponse.json({ error: "Failed to scrape JD from URL" }, { status: 500 });
            }
        }

        if (!file) return NextResponse.json({ error: "File required" }, { status: 400 });

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const tempDir = os.tmpdir();
        const tempFilePath = join(tempDir, `${uuidv4()}-${file.name}`);
        await writeFile(tempFilePath, buffer);

        let outputData = "";
        let errorData = "";

        const bucket = type === "JD" 
            ? (process.env.R2_JDS_BUCKET || "jds")
            : type === "PASSPORT"
                ? (process.env.R2_PASSPHOTO_BUCKET || "passportphoto")
                : (process.env.R2_RESUMES_BUCKET || "resumes");

        const prefix = type === "JD" ? "jds/" : type === "PASSPORT" ? "passport/" : "resumes/";
        const fileName = `${prefix}${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

        // Primary bottleneck: Java/Python Extraction
        const pythonCommand = process.platform === "win32" ? "python" : "python3";
        const pythonProcess = spawn(pythonCommand, ["scripts/extract_pdf.py", tempFilePath, type]);

        pythonProcess.stdout.on("data", (data) => { outputData += data.toString(); });
        pythonProcess.stderr.on("data", (data) => { errorData += data.toString(); });

        const exitCode = await new Promise((resolve) => {
            pythonProcess.on("close", (code) => resolve(code));
        });

        // 7. SYNC UPLOAD: Handle R2 persistence
        let fileUrl = null;
        try {
            const { putObject } = await import("@/lib/s3");
            fileUrl = await putObject(bucket, fileName, buffer, file.type);
            console.log("[STORAGE_SUCCESS]:", { type, fileName, url: fileUrl });
        } catch (storageErr: any) {
            console.error("[STORAGE_FATAL_ERROR]:", { type, fileName, error: storageErr.message });
            // For JD, it's critical we have a persistent link
            if (type === "JD") {
                return NextResponse.json({ 
                    error: "Could not persist JD to cloud storage. Please check bucket permissions.", 
                    code: "STORAGE_VULNERABILITY",
                    details: storageErr.message 
                }, { status: 507 });
            }
        }

        // Cleanup temp file (after upload is attempted)
        await unlink(tempFilePath).catch(() => { });

        if (type === "PASSPORT") {
            if (!fileUrl) {
                return NextResponse.json({ 
                    error: "Passport security dispatch failed. Identity persistence incomplete.", 
                    code: "STORAGE_VULNERABILITY" 
                }, { status: 507 });
            }
            return NextResponse.json({ url: fileUrl });
        }

        if (exitCode !== 0) {
            console.error("Python Extraction Failed:", errorData);
            return NextResponse.json({ 
                error: "Document processing failed. The file format might be unsupported or corrupted.",
                code: "EXTRACTION_PROCESS_ERROR",
                details: errorData 
            }, { status: 502 });
        }

        try {
            const result = JSON.parse(outputData);
            return NextResponse.json({
                ...result,
                url: fileUrl || null  // null if R2 upload failed (only for non-critical assets)
            });
        } catch (e) {
            console.error("Parse Error:", outputData, e);
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
