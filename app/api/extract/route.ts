import { NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import { extractJDFromText } from "@/lib/openai";
import { z } from "zod";

const extractQuerySchema = z.object({
    type: z.enum(["JD", "RESUME"]),
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

        if (!typeRaw || !["JD", "RESUME"].includes(typeRaw)) {
            return NextResponse.json({ error: "Invalid type. Must be JD or RESUME" }, { status: 400 });
        }

        const type = typeRaw as "JD" | "RESUME";

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

        // ── PARALLEL PROCESSING: Extraction + Background Upload ────────────────
        const uploadPromise = (async () => {
            try {
                const { putObject } = await import("@/lib/s3");
                const bucket = type === "JD" 
                    ? (process.env.R2_JDS_BUCKET || "jds")
                    : (process.env.R2_RESUMES_BUCKET || "resumes");
                
                const prefix = type === "JD" ? "jds/" : "resumes/";
                const fileName = `${prefix}${uuidv4()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                return await putObject(bucket, fileName, buffer, file.type);
            } catch (err) { 
                console.error("R2 Upload Error:", err);
                return null; 
            }
        })();

        // Primary bottleneck: Java/Python Extraction
        const pythonCommand = process.platform === "win32" ? "python" : "python3";
        const pythonProcess = spawn(pythonCommand, ["scripts/extract_pdf.py", tempFilePath, type]);

        let outputDataStr = "";
        let errorDataStr = "";

        pythonProcess.stdout.on("data", (data) => { outputDataStr += data.toString(); });
        pythonProcess.stderr.on("data", (data) => { errorDataStr += data.toString(); });

        const exitCode = await new Promise((resolve) => {
            pythonProcess.on("close", (code) => resolve(code));
        });

        outputData = outputDataStr;
        errorData = errorDataStr;

        // Cleanup temp file
        await unlink(tempFilePath).catch(() => { });

        // Wait for R2 URL but don't let it block if extraction failed
        const fileUrl = await uploadPromise;

        if (exitCode !== 0) {
            console.error("Python Extraction Failed:", errorData);
            return NextResponse.json({ 
                error: "Document processing failed. The file format might be unsupported or corrupted.",
                code: "EXTRACTION_PROCESS_ERROR",
                details: errorData 
            }, { status: 502 });
        }

        if (!fileUrl) {
            return NextResponse.json({ 
                error: "Secure storage upload failed. We couldn't save your document.",
                code: "STORAGE_UPLOAD_ERROR",
                details: "Cloudflare R2 connection timed out or rejected the request."
            }, { status: 503 });
        }

        try {
            const result = JSON.parse(outputData);
            return NextResponse.json({
                ...result,
                url: fileUrl
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
