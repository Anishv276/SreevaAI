import { NextResponse } from "next/server";
import crypto from "crypto";

// Pre-generate 15MB buffer once to eliminate per-request CPU overhead
const DOWNLOAD_SIZE = 15 * 1024 * 1024;
const STATIC_BUFFER = crypto.randomBytes(DOWNLOAD_SIZE);

// GET /api/speedtest - Returns a 15MB random payload to test DOWNLOAD speed
export async function GET() {
    try {
        return new Response(STATIC_BUFFER, {
            status: 200,
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Length": DOWNLOAD_SIZE.toString(),
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        });
    } catch (e) {
        return NextResponse.json({ error: "Download test failed" }, { status: 500 });
    }
}

// POST /api/speedtest - Consumes payload to test UPLOAD speed
export async function POST(request: Request) {
    try {
        // Standard ping check (no body)
        if (request.headers.get("content-length") === "0" || request.headers.get("X-Pulse") === "true") {
             return NextResponse.json({ success: true, type: "ping", timestamp: Date.now() });
        }

        // Speed check optimization: If this is an upload test, we prioritize consuming the body
        const isUploadTest = request.headers.get("X-Speed-Test") === "upload";

        // Consume the stream fully to measure throughput
        const reader = request.body?.getReader();
        if (reader) {
            while (true) {
                const { done } = await reader.read();
                if (done) break;
            }
        }

        return NextResponse.json({ 
            success: true, 
            type: "upload", 
            timestamp: Date.now() 
        });
    } catch {
        return NextResponse.json({ success: false }, { status: 400 });
    }
}
