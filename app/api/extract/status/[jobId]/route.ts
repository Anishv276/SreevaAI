import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import redisConnection from "@/lib/redis";
import { JD_EXTRACTION_QUEUE_NAME } from "@/lib/jd-extraction";
import { recordOrgBillingUsage } from "@/lib/usage-metrics";
import { getSession } from "@/lib/auth";

function hydrateJdExtraction(payload: { data?: Record<string, any> }) {
    return payload.data && typeof payload.data === "object" ? payload.data : {};
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ jobId: string }> }
) {
    const { jobId } = await params;
    if (!jobId) {
        return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    const queue = new Queue(JD_EXTRACTION_QUEUE_NAME, { connection: redisConnection });
    try {
        const job = await queue.getJob(jobId);
        if (!job) {
            // Job was already removed (completed + cleaned up) or never existed
            return NextResponse.json({ status: "not_found" }, { status: 404 });
        }

        const state = await job.getState();

        if (state === "failed") {
            return NextResponse.json({
                status: "failed",
                error: job.failedReason || "Extraction failed",
            }, { status: 200 });
        }

        if (state === "completed") {
            const result = job.returnvalue as { data?: Record<string, any>; text?: string; usage?: any };
            const hydratedData = hydrateJdExtraction({ data: result?.data });

            // Record billing usage now that we have the result
            let orgId: string | null = null;
            try {
                const session = await getSession();
                orgId = session?.orgId || null;
            } catch { /* no session */ }

            if (orgId && result?.usage) {
                await recordOrgBillingUsage({
                    orgId,
                    feature: "jdExtraction",
                    usage: result.usage,
                }).catch(() => {});
            }

            return NextResponse.json({
                status: "completed",
                data: hydratedData,
                text: result?.text ?? null,
            });
        }

        // waiting / active / delayed
        return NextResponse.json({ status: "processing" });
    } finally {
        await queue.close().catch(() => {});
    }
}