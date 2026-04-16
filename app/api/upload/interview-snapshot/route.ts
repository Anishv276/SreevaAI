import { NextResponse } from "next/server";
import { interviewSnapshotQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { imageDataUrl, candidateName, applicationId, interviewToken, label } = body;
        
        console.log(`[SNAPSHOT_API] Processing for AppID: ${applicationId}`);

        if (!imageDataUrl || !applicationId || !interviewToken) {
            return NextResponse.json({ error: "Missing required fields (imageDataUrl, applicationId, or interviewToken)" }, { status: 400 });
        }

        // ── AUTHENTICATION ────────────────────────────────
        const interview = await prisma.interview.findUnique({
            where: { applicationId },
            select: { accessToken: true, status: true }
        });

        if (!interview || interview.accessToken !== interviewToken) {
            return NextResponse.json({ error: "Unauthorized: Invalid session token" }, { status: 401 });
        }

        if (interview.status !== "INPROGRESS" && interview.status !== "PENDING") {
             return NextResponse.json({ error: "Unauthorized: Interview is not in an active state" }, { status: 403 });
        }
        // ──────────────────────────────────────────────────

        // Offload to BullMQ worker
        // We send the full data here. Since Redis has a 32MB limit, 
        // the worker is configured to remove jobs immediately on completion.
        await interviewSnapshotQueue.add(`snapshot-${applicationId}-${Date.now()}`, {
            imageDataUrl,
            applicationId,
            candidateName,
            label
        });

        // Return 202 Accepted immediately to free the frontend thread
        return NextResponse.json({ status: "queued", applicationId }, { status: 202 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[SNAPSHOT_QUEUE_ERROR]:", message);
        return NextResponse.json({ error: "Failed to queue snapshot" }, { status: 500 });
    }
}
