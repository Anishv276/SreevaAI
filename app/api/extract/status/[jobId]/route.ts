import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import redisConnection from "@/lib/redis";
import { JD_EXTRACTION_QUEUE_NAME } from "@/lib/jd-extraction";
import { resumeQueue } from "@/lib/queue";
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

    // -- AUTH + IDOR GUARD ----------------------------------------------------
    // BullMQ assigns sequential integer job IDs, so without an ownership check any
    // authenticated (or unauthenticated) caller could enumerate /status/1..N and
    // read other orgs' extracted JD/resume text. Require a session and verify the
    // job belongs to the caller's org (SUPER_ADMIN exempt) before returning data.
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }
    const callerOrgId = session.role === "SUPER_ADMIN" ? null : (session.orgId ?? null);

    const queue = new Queue(JD_EXTRACTION_QUEUE_NAME, { connection: redisConnection });
    try {
        const readJob = async (candidateQueue: Queue, source: "jd" | "resume") => {
            const job = await candidateQueue.getJob(jobId);
            if (!job) return null;

            // Enforce org ownership of the job before exposing any of its data.
            // callerOrgId === null means SUPER_ADMIN (allowed to read any job).
            if (callerOrgId !== null) {
                const jobOrgId = (job.data as Record<string, unknown> | undefined)?.orgId;
                if (typeof jobOrgId !== "string" || jobOrgId !== callerOrgId) {
                    return null; // treat as not-found — don't reveal existence
                }
            }

            const state = await job.getState();
            if (state === "failed") {
                return {
                    status: "failed",
                    error: job.failedReason || "Extraction failed",
                };
            }

            if (state === "completed") {
                const result = job.returnvalue as { data?: Record<string, any>; text?: string; usage?: any; url?: string };
                if (source === "jd") {
                    const hydratedData = hydrateJdExtraction({ data: result?.data });

                    // Bill the authenticated caller's org; fall back to the job's
                    // own orgId (e.g. for SUPER_ADMIN reads where session.orgId is null).
                    let orgId: string | null = session.orgId || null;
                    if (!orgId) {
                        const jobOrgId = (job.data as Record<string, unknown> | undefined)?.orgId;
                        if (typeof jobOrgId === "string" && jobOrgId.trim()) {
                            orgId = jobOrgId.trim();
                        }
                    }

                    const alreadyBilled = Boolean((job.data as Record<string, unknown> | undefined)?.usageBilled);
                    if (orgId && result?.usage && !alreadyBilled) {
                        await recordOrgBillingUsage({
                            orgId,
                            feature: "jdExtraction",
                            usage: {
                                ...result.usage,
                                eventId: `jd-extraction:${jobId}`,
                            },
                        });

                        try {
                            await job.updateData({
                                ...(job.data as Record<string, unknown> | undefined),
                                usageBilled: true,
                                usageBilledAt: new Date().toISOString(),
                            });
                        } catch {
                            // Best effort only: billing is already recorded above.
                        }
                    }

                    return {
                        status: "completed",
                        data: hydratedData,
                        text: result?.text ?? null,
                    };
                }

                return {
                    status: "completed",
                    data: result?.data ?? {},
                    text: result?.text ?? null,
                    url: result?.url ?? null,
                    usage: result?.usage ?? null,
                };
            }

            return { status: "processing" };
        };

        const jdResult = await readJob(queue, "jd");
        if (jdResult) {
            return NextResponse.json(jdResult, { status: jdResult.status === "failed" ? 200 : 200 });
        }

        const resumeResult = await readJob(resumeQueue, "resume");
        if (resumeResult) {
            return NextResponse.json(resumeResult, { status: resumeResult.status === "failed" ? 200 : 200 });
        }

        return NextResponse.json({ status: "not_found" }, { status: 404 });
    } finally {
        await queue.close().catch(() => {});
    }
}
