import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";
import { buildJdTextFromExtractedDetails } from "@/lib/question-bank/jd-text";
import { questionGenerationQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

/**
 * POST /api/jobs/[id]/generate-questions
 *
 * "Start Generation" endpoint -- validates the job is ready, then enqueues
 * the Call A/B/C pipeline onto the question-generation worker (worker.ts)
 * and returns immediately. The wizard polls
 * GET /api/jobs/[id]/generate-questions/status for progress/result.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    let jobId = "";
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { id } = await params;
        jobId = id;

        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { organizationId: true, jdExtractedDetails: true, questionBankVersion: true },
        });
        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        const isSuperAdmin = session.role === "SUPER_ADMIN";
        if (!isSuperAdmin && job.organizationId !== session.orgId) {
            return NextResponse.json({ error: "Access Denied: Ownership required to generate questions" }, { status: 403 });
        }

        const jdText = buildJdTextFromExtractedDetails(job.jdExtractedDetails);
        if (!jdText.trim()) {
            return NextResponse.json(
                { error: "No job description text found on this job -- upload/extract a JD before generating questions." },
                { status: 400 }
            );
        }

        const isRegeneration = job.questionBankVersion > 0;
        const body = await request.json().catch(() => ({}));
        const numQuestions = Number(body?.numQuestions) || 5;

        await prisma.job.update({
            where: { id: jobId },
            data: {
                status: isRegeneration ? "REGENERATING" : "GENERATING",
                failureReason: null,
            },
        });

        await questionGenerationQueue.add("generate", { jobId, numQuestions }, { jobId: `question-generation-${jobId}-${Date.now()}` });

        return NextResponse.json({ queued: true, status: isRegeneration ? "REGENERATING" : "GENERATING" }, { status: 202 });
    } catch (error: any) {
        if (jobId) {
            await prisma.job.update({
                where: { id: jobId },
                data: { status: "FAILED", failureReason: "Unexpected server error while queueing generation" },
            }).catch(() => {});
        }
        return apiErrorResponse({
            route: "/api/jobs/[id]/generate-questions",
            method: "POST",
            error,
            body: { error: "Failed to queue question generation" },
            status: 500,
            logLabel: "[GENERATE_QUESTIONS_ERROR]:",
        });
    }
}
