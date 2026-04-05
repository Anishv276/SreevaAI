import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gradingQueue } from "@/lib/queue";

// Assessment feature not yet implemented - schema missing Assessment model
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    return NextResponse.json({ error: "Assessment feature not available" }, { status: 501 });
}
