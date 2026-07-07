import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Store events in memory per interview (simple approach for testing)
const eventStore = new Map<string, Array<{
    timestamp: number;
    type: "response_received" | "eval_start" | "eval_done" | "probe" | "saturate" | "move_on" | "llm_generating" | "llm_done" | "signal_fired" | "session_ended";
    message: string;
    data?: Record<string, unknown>;
}>>();

export async function POST(request: Request) {
    try {
        const { applicationId, event, message, data } = await request.json();

        if (!applicationId || !event || !message) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        // Store event
        if (!eventStore.has(applicationId)) {
            eventStore.set(applicationId, []);
        }

        const events = eventStore.get(applicationId)!;
        events.push({
            timestamp: Date.now(),
            type: event,
            message,
            data,
        });

        // Keep only last 100 events per interview
        if (events.length > 100) {
            events.shift();
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[TEST_EVENTS_POST]", e);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const applicationId = searchParams.get("applicationId");

        if (!applicationId) {
            return NextResponse.json({ error: "applicationId required" }, { status: 400 });
        }

        // Return all stored events for this interview
        const events = eventStore.get(applicationId) || [];

        return NextResponse.json({ events });
    } catch (e) {
        console.error("[TEST_EVENTS_GET]", e);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const applicationId = searchParams.get("applicationId");

        if (applicationId) {
            eventStore.delete(applicationId);
        } else {
            eventStore.clear();
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[TEST_EVENTS_DELETE]", e);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
