import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
    let applicationId = "";
    try {
        const body = await req.json().catch(() => ({}));
        applicationId = String(body?.applicationId || "").trim();
    } catch { }
    console.warn(`[start-recording] Deprecated endpoint hit for ${applicationId || "unknown_application"}.`);
    return NextResponse.json(
        { error: "Endpoint deprecated. Use /api/interview/egress with action=start." },
        { status: 410 }
    );
}
