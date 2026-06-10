import { NextResponse } from "next/server";

export async function POST() {
    return NextResponse.json(
        { error: "LiveKit webhook endpoint is not enabled" },
        { status: 410 }
    );
}
