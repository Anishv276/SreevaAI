import { NextResponse } from "next/server";

export async function POST(request: Request) {
    // Simply consume the stream to simulate upload payload processing
    try {
        await request.text(); // Wait for body to fully download on server
        return NextResponse.json({ success: true, timestamp: Date.now() });
    } catch {
        return NextResponse.json({ success: false }, { status: 400 });
    }
}
