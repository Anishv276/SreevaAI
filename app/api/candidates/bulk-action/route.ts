import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { appendCandidateActivity } from "@/lib/candidate-activity";
import { apiErrorResponse } from "@/lib/slack-error-logger";
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const orgId = session.orgId;
        if (!orgId) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { ids, action }: { ids: string[]; action: "reject" | "delete" | "shortlist" } = await request.json();
        if (!ids?.length || !action) {
            return NextResponse.json({ error: "ids and action are required" }, { status: 400 });
        }
        // Security: only operate on applications belonging to this org
        const applications = await prisma.application.findMany({
            where: { id: { in: ids }, job: { organizationId: orgId } },
            select: {
                id: true,
                candidateFullName: true,
                candidateEmail: true,
                resumeFileUrl: true,
                job: { select: { id: true, title: true, organizationId: true } },
            },
        });
        if (!applications.length) {
            return NextResponse.json({ error: "No matching candidates found" }, { status: 404 });
        }
        const validIds = applications.map((a: (typeof applications)[number]) => a.id);
        if (action === "delete") {
            // -- QUEUE CLEANUP --
            try {
                const { resumeQueue } = await import("@/lib/queue");
                const waitingResume = await resumeQueue.getJobs(['waiting', 'delayed', 'active']);
                for (const job of waitingResume) {
                    if (validIds.includes(job.data.applicationId)) {
                        await job.remove();
                    }
                }
            } catch (queueErr) {
                console.warn("[BULK_DELETE] Could not clean queue jobs:", queueErr);
            }
            // -- SOFT DELETE: DATABASE CLEANUP (Cascading) ---------------------------
            await prisma.$transaction(async (tx) => {
                if (validIds.length > 0) {
                    const idList = Prisma.join(validIds);
                    // 1. Nullify FK on Interview before deleting Application rows
                    await tx.$executeRaw`
                        UPDATE "SupportTicket" SET "ticketStatus" = 'DELETED'
                        WHERE "interviewId" IN (
                            SELECT "id" FROM "Interview" WHERE "applicationId" IN (${idList})
                        )
                    `;
                    // 2. Delete Interview rows (FK blocks renaming applicationId, so just delete)
                    await tx.$executeRaw`
                        DELETE FROM "Interview" WHERE "applicationId" IN (${idList})
                    `;
                    // 3. Soft delete applications
                    await tx.application.updateMany({
                        where: { id: { in: validIds } },
                        data: { isDeleted: true }
                    });
                }
            });
            return NextResponse.json({ message: `${validIds.length} candidates deleted` });
        }
        if (action === "shortlist") {
            await prisma.application.updateMany({
                where: { id: { in: validIds } },
                data: {
                    resumeScreeningStatus: "shortlisted",
                    interviewPhaseStatus: "pending",
                },
            });
            await Promise.all(validIds.map((id) => appendCandidateActivity(id, {
                type: "status_changed",
                label: "Resume shortlisted",
                details: "resume=shortlisted, interview=pending",
                timestamp: new Date().toISOString(),
                source: "hr",
            })));
            return NextResponse.json({ message: `${validIds.length} candidates shortlisted` });
        }
        if (action === "reject") {
            await prisma.application.updateMany({
                where: { id: { in: validIds } },
                data: {
                    resumeScreeningStatus: "rejected",
                    interviewPhaseStatus: "Not Qualified",
                },
            });
            await Promise.all(validIds.map((id) => appendCandidateActivity(id, {
                type: "status_changed",
                label: "Resume rejected",
                details: `resume=rejected, interview=Not Qualified`,
                timestamp: new Date().toISOString(),
                source: "hr",
            })));
            return NextResponse.json({ message: `${validIds.length} candidates rejected` });
        }
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/candidates/bulk-action",
            method: "POST",
            error,
            body: { error: "Failed to perform bulk action" },
            status: 500,
            logLabel: "[bulk-action] error:",
        });
    }
}
