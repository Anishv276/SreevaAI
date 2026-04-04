import { NextResponse } from "next/server";
import { proctoringQueue } from "@/lib/queue";
import { proctoringEventsSchema } from "@/lib/validation";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        const result = proctoringEventsSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { events } = result.data;

        await proctoringQueue.add("process-event-batch", {
            assessmentId: id,
            events: events.map((e) => ({
                eventType: e.eventType,
                severity: e.severity || "MEDIUM",
                reason: e.reason,
                durationSeconds: e.durationSeconds,
                metadata: typeof e.metadata === 'string' ? e.metadata : JSON.stringify(e.metadata || {}),
                timestamp: e.timestamp || new Date().toISOString()
            }))
        });

        return NextResponse.json({ success: true, count: events.length });

    } catch (error) {
        console.error("[PROCTORING_EVENT_BATCH_ERROR]:", error);
        return NextResponse.json({ error: "Failed to queue proctoring events" }, { status: 500 });
    }
}

