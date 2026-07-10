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

        // jobId: appId -- BullMQ silently no-ops .add() if a job with this ID already
        // exists, so a genuinely NEW interview reusing an old test appId (or a retry
        // after the queue was cleared) would enqueue nothing and nobody would know.
        // Skip when the prior job is still in-flight (waiting/active/delayed), OR when
        // it completed within the last 2 minutes -- LiveKit occasionally recycles the
        // agent job right after room teardown, causing entrypoint() to run twice and
        // POST here twice for the SAME interview a few seconds apart (seen as 14 LLM
        // calls instead of 7). A finished job older than 2 minutes is treated as a
        // real re-run and allowed through, matching this queue's own removeOnComplete
        // retention (see lib/queue.ts).
        const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
        const existing = await interviewReportQueue.getJob(appId);
        if (existing) {
            const state = await existing.getState();
            const recentlyCompleted = state === "completed" && !!existing.finishedOn
                && Date.now() - existing.finishedOn < DUPLICATE_WINDOW_MS;
            if ((state === "completed" || state === "failed") && !recentlyCompleted) {
                await existing.remove();
            } else {
                console.warn(`[INTERNAL_INTERVIEW_REPORT_POST] appId=${appId} already ${state} in queue -- skipping duplicate enqueue`);
                return NextResponse.json({ ok: true, skipped: true, reason: state }, { status: 202 });
            }
        }
        await interviewReportQueue.add("generate-report", payload, { jobId: appId });

        return NextResponse.json({ ok: true }, { status: 202 });
    } catch (e) {
        console.error("[INTERNAL_INTERVIEW_REPORT_POST]", e);
        return NextResponse.json({ error: "Failed to enqueue report job" }, { status: 500 });
    }
}
