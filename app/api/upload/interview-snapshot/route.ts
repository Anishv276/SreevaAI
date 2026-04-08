import { NextResponse } from "next/server";
import { interviewSnapshotQueue } from "@/lib/queue";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { imageDataUrl, candidateName, applicationId, label } = body;
        
        console.log(`[SNAPSHOT_API] Queueing offload for AppID: ${applicationId}`);

        if (!imageDataUrl || !applicationId) {
            return NextResponse.json({ error: "Missing imageDataUrl or applicationId" }, { status: 400 });
        }

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
