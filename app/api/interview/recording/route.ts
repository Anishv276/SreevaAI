import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
    return NextResponse.json(
        {
            error: "Browser recording endpoint has been removed. Use /api/interview/egress for server-side LiveKit recording.",
        },
        { status: 410 }
    );
}
