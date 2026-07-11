import { NextResponse } from "next/server";
import { extractionLimiter } from "@/lib/rate-limit";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { enqueueJdExtraction } from "@/lib/jd-extraction";
import { resumeQueue } from "@/lib/queue";
import { safeFetch, SsrfBlockedError } from "@/lib/safe-fetch";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
    try {
        // -- AUTH: this route enqueues billable extraction work and (for JDs)
        // fetches arbitrary URLs server-side. It must require a valid session;
        // previously the session was read inside a try/catch that swallowed
        // failures and the orgId was taken from a client form field.
        const session = await getSession();
        if (!session || (!isAdminRole(session.role) && !isSuperAdminRole(session.role))) {
            return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        }
        // -- RATE LIMITING -------------------
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
        const contentLength = request.headers.get("content-length");
        console.log(`[API_EXTRACT] Processing request. Header Content-Length: ${contentLength} bytes`);
        const maxBufferedBody = 20 * 1024 * 1024;
        const reportedLength = contentLength ? Number(contentLength) : NaN;
        if (!Number.isNaN(reportedLength) && reportedLength > maxBufferedBody) {
            return NextResponse.json({
                error: "File size exceeds 20MB limit.",
                code: "FILE_TOO_LARGE",
                details: `Request size ${reportedLength} bytes exceeds supported limit of ${maxBufferedBody} bytes.`,
            }, { status: 413 });
        }
        let formData: FormData;
        try {
            formData = await request.formData();
        } catch (parseError: any) {
            console.error("[EXTRACTION_PARSE_ERROR]", parseError);
            return NextResponse.json({
                error: "File size is larger than supported limit.",
                code: "FILE_PARSE_ERROR",
                details: parseError.message
            }, { status: 400 });
        }
        const file = formData.get("file") as File | null;
        const url = formData.get("url") as string | null;
        const typeRaw = formData.get("type") as string | null;
        // Org is derived from the authenticated session only. A SUPER_ADMIN (no
        // single org) may target a specific org via the form field; everyone else
        // is pinned to their session org and the client value is ignored.
        const explicitOrgId = (formData.get("orgId") as string | null)?.trim() || null;
        const orgId = session.role === "SUPER_ADMIN" ? (explicitOrgId || session.orgId) : session.orgId;
        if (!orgId) {
            return NextResponse.json({ error: "Organization context is required" }, { status: 400 });
        }
        if (!file && !url) {
            return NextResponse.json({ error: "Missing file or URL" }, { status: 400 });
        }
        if (!typeRaw || !["JD", "RESUME"].includes(typeRaw)) {
            return NextResponse.json({ error: "Invalid type. Must be JD or RESUME" }, { status: 400 });
        }
        const type = typeRaw as "JD" | "RESUME";
        const isJd = typeRaw === "JD";
        // Fetch org's LLM model from DB -- set via Super Admin → AI Models
        const orgRow = await prisma.organizationDetails.findUnique({
            where: { id: orgId },
            select: { llmJdExtraction: true, llmResumeExtraction: true },
        });
        const orgOpenAIModel = isJd
            ? orgRow!.llmJdExtraction
            : orgRow!.llmResumeExtraction;
        if (isJd) {
            if (url) {
                console.log("[SCRAPE_START]: Fetching URL:", url);
                let text: string;
                try {
                    const { load } = await import("cheerio");
                    // SSRF-safe: validates the URL against private/loopback/metadata
                    // ranges and disables redirect following before fetching.
                    const response = await safeFetch(url);
                    if (!response.ok) {
                        console.error("[SCRAPE_FETCH_FAILED]:", { status: response.status });
                        return NextResponse.json({ error: "Failed to fetch URL" }, { status: 400 });
                    }
                    const html = await response.text();
                    const $ = load(html);
                    $("script, style, nav, footer, header, noscript, iframe").remove();
                    text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 15000);
                    console.log("[SCRAPE_SUCCESS]: Text extracted, length:", text.length);
                } catch (err: any) {
                    if (err instanceof SsrfBlockedError) {
                        return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
                    }
                    console.error("[SCRAPE_FATAL_ERROR]:", { error: err.message });
                    return NextResponse.json({ error: "Failed to scrape JD from URL" }, { status: 500 });
                }
                const jobId = await enqueueJdExtraction({ kind: "text", text, orgOpenAIModel, orgId });
                console.log(`[JD-EXTRACT] Enqueued URL extraction job ${jobId}`);
                return NextResponse.json({ jobId }, { status: 202 });
            }
            if (!file) {
                return NextResponse.json({ error: "File required" }, { status: 400 });
            }
            const MAX_SIZE = 20 * 1024 * 1024;
            if (file.size > MAX_SIZE) {
                return NextResponse.json({
                    error: "File size exceeds 20MB limit.",
                    code: "FILE_TOO_LARGE",
                }, { status: 413 });
            }
            const allowedTypes = [
                "application/pdf",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "text/plain",
            ];
            const isMimeAllowed = allowedTypes.some((t) => file.type.includes(t));
            if (!isMimeAllowed) {
                const validExts = /\.(pdf|docx|txt)$/i;
                if (!file.name.match(validExts)) {
                    return NextResponse.json({
                        error: "Invalid file type for JD.",
                        code: "INVALID_FILE_TYPE",
                    }, { status: 415 });
                }
            }
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);
            console.log("[FILE_EXTRACT_START]:", { name: file.name, size: buffer.length, type });
            // Upload to R2 and enqueue extraction concurrently
            const [jobId, fileUrl] = await Promise.all([
                enqueueJdExtraction({ kind: "file", fileName: file.name, buffer, orgOpenAIModel, orgId }),
                (async () => {
                    try {
                        const bucket = process.env.R2_JDS_BUCKET || "jds";
                        const orgForSlug = await prisma.organizationDetails.findUnique({ where: { id: orgId }, select: { urlSlug: true } });
                        const orgSlug = orgForSlug?.urlSlug || orgId;
                        const fileName = `JDs/${orgSlug}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_').toLowerCase()}`;
                        console.log("[STORAGE_PUSH]: Uploading JD to R2", fileName);
                        const { putObject } = await import("@/lib/s3");
                        return await putObject(bucket, fileName, buffer, file.type);
                    } catch (err: any) {
                        console.error("[STORAGE_FATAL_ERROR]: JD R2 Upload Failed", err.message);
                        return null;
                    }
                })()
            ]);
            console.log(`[JD-EXTRACT] Enqueued file extraction job ${jobId}`);
            return NextResponse.json({ jobId, url: fileUrl }, { status: 202 });
        }
        // -- RESUME path: upload to R2, then hand off extraction to the worker --
        if (!file) {
            return NextResponse.json({ error: "File required" }, { status: 400 });
        }
        const MAX_SIZE = 20 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            return NextResponse.json({
                error: "File size exceeds 20MB limit.",
                code: "FILE_TOO_LARGE"
            }, { status: 413 });
        }
        const allowedTypes = {
            JD: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
            RESUME: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
        };
        const currentAllowed = allowedTypes[type as keyof typeof allowedTypes] || [];
        const isMimeAllowed = currentAllowed.some(t => file.type.includes(t) || (t.endsWith("/*") && file.type.startsWith(t.split("/")[0])));
        if (!isMimeAllowed) {
            const validExts = /\.(pdf|docx|txt)$/i;
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
        console.log("[FILE_EXTRACT_START]:", { name: file.name, size: byteLength, type });
        const bucket = process.env.R2_RESUMES_BUCKET || "resumes";
        const orgForSlug = await prisma.organizationDetails.findUnique({ where: { id: orgId }, select: { urlSlug: true } });
        const orgSlug = orgForSlug?.urlSlug || orgId;
        const fileName = `resume/${orgSlug}/general_extraction/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_').toLowerCase()}`;
        console.log("[STORAGE_PUSH]: Uploading to R2", fileName);
        const { putObject } = await import("@/lib/s3");
        const fileUrl = await putObject(bucket, fileName, buffer, file.type);
        console.log("[STORAGE_SUCCESS]:", { type, fileName, url: fileUrl });
        const jobId = await resumeQueue.add(
            "resume-file-extract",
            {
                bucket,
                key: fileName,
                fileUrl,
                fileName: file.name,
                orgId,
                orgOpenAIModel,
            },
            {
                attempts: 2,
                backoff: { type: "exponential", delay: 1500 },
            }
        );
        console.log(`[RESUME-EXTRACT] Enqueued resume extraction job ${jobId.id}`);
        return NextResponse.json({
            jobId: jobId.id,
            url: fileUrl,
            status: "queued",
        }, { status: 202 });
    } catch (error: any) {
        console.error("General Extraction Error:", error);
        return NextResponse.json({
            error: "An unexpected error occurred while processing your request.",
            code: "INTERNAL_SERVER_ERROR",
        }, { status: 500 });
    }
}
