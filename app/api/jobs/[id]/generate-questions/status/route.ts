import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/jobs/[id]/generate-questions/status
 *
 * Polled by the Create Job wizard while question generation runs on the
 * worker (worker.ts). Job.status/questionBank are the worker's source of
 * truth -- no BullMQ job-state lookup needed, and no progress log is
 * persisted (worker just console.logs, same as every other queue here).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    const { id } = await params;

    const job = await prisma.job.findUnique({
        where: { id },
        select: {
            organizationId: true,
            status: true,
            failureReason: true,
            questionBank: true,
        },
    });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const isSuperAdmin = session.role === "SUPER_ADMIN";
    if (!isSuperAdmin && job.organizationId !== session.orgId) {
        return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    return NextResponse.json({
        status: job.status,
        failureReason: job.failureReason,
        questionBank: job.status === "GENERATED" ? job.questionBank : null,
    });
}
