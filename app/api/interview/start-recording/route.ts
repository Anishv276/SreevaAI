import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    let applicationId = "";
    try {
        const body = await req.json().catch(() => ({}));
        applicationId = String(body?.applicationId || "").trim();
    } catch { }
    console.warn(`[start-recording] Disabled endpoint hit for ${applicationId || "unknown_application"}; browser MediaRecorder flow is active.`);
    return NextResponse.json(
        { error: "LiveKit egress recording is disabled. Use /api/interview/recording browser upload flow." },
        { status: 410 }
    );
}
