import { NextResponse } from "next/server";
import crypto from "crypto";

// GET /api/speedtest - Returns a 4MB random payload to test DOWNLOAD speed
export async function GET() {
    try {
        // Generate 4MB of random bytes
        const size = 4 * 1024 * 1024;
        const buffer = crypto.randomBytes(size);

        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Length": size.toString(),
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
        if (request.headers.get("content-length") === "0") {
             return NextResponse.json({ success: true, type: "ping", timestamp: Date.now() });
        }

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
