import { NextResponse } from "next/server";
import crypto from "crypto";
import { interviewReportQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

/**
 * Internal-only trigger for the interview-report BullMQ queue. Called by the
 * Python LiveKit agent (interview/agent_runtime.py) right after it persists
 * the transcript/scores, so the ~300s report/summary/billing/debug-PDF tail
 * runs on the durable Node worker instead of the agent job (which LiveKit
 * Cloud recycles shortly after the room closes).
 */
function isAuthorized(request: Request): boolean {
    const secret = process.env.INTERNAL_API_SECRET || "";
    const provided = request.headers.get("x-internal-secret") || "";
    if (!secret || !provided) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const payload = await request.json();
        const appId = payload?.appId;
        if (!appId || typeof appId !== "string") {
            return NextResponse.json({ error: "Missing appId" }, { status: 400 });
        }

        // jobId: appId -- a duplicate enqueue for the same interview is a no-op
        // while the job exists, rather than double-processing.
        await interviewReportQueue.add("generate-report", payload, { jobId: appId });

        return NextResponse.json({ ok: true }, { status: 202 });
    } catch (e) {
        console.error("[INTERNAL_INTERVIEW_REPORT_POST]", e);
        return NextResponse.json({ error: "Failed to enqueue report job" }, { status: 500 });
    }
}
