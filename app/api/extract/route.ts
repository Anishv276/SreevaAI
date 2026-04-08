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

                const data = await extractJDFromText(text);
                return NextResponse.json({ data, text });
            } catch (err: any) {
                console.error("[SCRAPE_FATAL_ERROR]:", { url, error: err.message });
                return NextResponse.json({ error: "Failed to scrape JD from URL" }, { status: 500 });
            }
        }

        if (!file) return NextResponse.json({ error: "File required" }, { status: 400 });

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

        // Primary bottleneck: Java/Python Extraction
        console.log("[PYTHON_EXEC]: Starting scripts/extract_pdf.py for", file.name);
        const pythonCommand = process.platform === "win32" ? "python" : "python3";
        const pythonProcess = spawn(pythonCommand, ["scripts/extract_pdf.py", tempFilePath, type]);

        pythonProcess.stdout.on("data", (data) => { outputData += data.toString(); });
        pythonProcess.stderr.on("data", (data) => { errorData += data.toString(); });

        const exitCode = await new Promise((resolve) => {
            pythonProcess.on("close", (code) => {
                console.log("[PYTHON_EXTRACT_END]: Exit code", code);
                resolve(code);
            });
        });

        // 7. SYNC UPLOAD: Handle R2 persistence
        let fileUrl = null;
        try {
            console.log("[STORAGE_PUSH]: Uploading to R2", fileName);
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
                console.log("[EXTRACTION_PARSE_SUCCESS]: Data parsed for", type);
                return NextResponse.json({
                    ...result,
                    url: fileUrl || null  // null if R2 upload failed (only for non-critical assets)
                });
            } catch (e: any) {
                console.error("[EXTRACTION_PARSE_FATAL]: Received invalid data format", { outputData: outputData.slice(0, 500), error: e.message });
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
