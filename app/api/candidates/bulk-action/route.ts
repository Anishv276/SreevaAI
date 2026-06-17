import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { appendCandidateActivity } from "@/lib/candidate-activity";

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const orgId = session.orgId;
        if (!orgId) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { ids, action }: { ids: string[]; action: "hire" | "reject" | "delete" | "shortlist" | "not_hired" } = await request.json();

        if (!ids?.length || !action) {
            return NextResponse.json({ error: "ids and action are required" }, { status: 400 });
        }

        // Security: only operate on applications belonging to this org
        const applications = await prisma.application.findMany({
            where: { id: { in: ids }, drive: { orgId } },
            select: {
                id: true,
                fullName: true,
                email: true,
                resumeUrl: true,
                drive: { select: { id: true, title: true, orgId: true } },
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
                const timestamp = Date.now().toString();

                if (validIds.length > 0) {
                    const placeholders = validIds.map(id => `'${id}'`).join(',');

                    // 1. Soft Delete Support Tickets FIRST (before Interview applicationId is renamed)
                    await tx.$executeRawUnsafe(`
                        UPDATE "SupportTicket" SET "status" = 'DELETED'
                        WHERE "interviewId" IN (
                            SELECT "id" FROM "Interview" WHERE "applicationId" IN (${placeholders})
                        )
                    `);

                    // 2. Soft delete interviews (rename unique keys via Raw SQL)
                    await tx.$executeRawUnsafe(`
                        UPDATE "Interview" 
                        SET "isDeleted" = true, 
                            "applicationId" = 'del_' || ${timestamp} || '_' || "applicationId", 
                            "accessToken" = 'del_' || ${timestamp} || '_' || "accessToken"
                        WHERE "applicationId" IN (${placeholders})
                    `);

                    // 3. Soft delete applications
                    await tx.application.updateMany({
                        where: { id: { in: validIds } },
                        data: { isDeleted: true }
                    });
                }
            });
            return NextResponse.json({ message: `${validIds.length} candidates soft-deleted` });
        }

        if (action === "shortlist") {
            await prisma.application.updateMany({
                where: { id: { in: validIds } },
                data: {
                    resumeStatus: "shortlisted",
                    interviewStatus: "pending",
                    hiringStatus: "pending",
                },
            });
            await Promise.all(validIds.map((id) => appendCandidateActivity(id, {
                type: "status_changed",
                label: "Resume shortlisted",
                details: "resume=shortlisted, interview=pending, hiring=pending",
                timestamp: new Date().toISOString(),
                source: "hr",
            })));
            return NextResponse.json({ message: `${validIds.length} candidates shortlisted` });
        }

        if (action === "not_hired" || action === "reject") {
            await prisma.application.updateMany({
                where: { id: { in: validIds } },
                data: {
                    resumeStatus: "rejected",
                    interviewStatus: "Not Qualified",
                    hiringStatus: "not hired",
                },
            });

            await Promise.all(validIds.map((id) => appendCandidateActivity(id, {
                type: "status_changed",
                label: action === "reject" ? "Resume rejected" : "Marked as not hired",
                details: `resume=rejected, interview=Not Qualified, hiring=${action === "reject" ? "Not Shortlisted" : "Not Hired"}`,
                timestamp: new Date().toISOString(),
                source: "hr",
            })));

            return NextResponse.json({ message: `${validIds.length} candidates marked as not hired` });
        }

        if (action === "hire") {
            await prisma.application.updateMany({
                where: { id: { in: validIds } },
                data: { hiringStatus: "hired", resumeStatus: "shortlisted", interviewStatus: "COMPLETED" },
            });

            await Promise.all(validIds.map((id) => appendCandidateActivity(id, {
                type: "status_changed",
                label: "Candidate hired",
                details: "resume=shortlisted, interview=COMPLETED, hiring=hired",
                timestamp: new Date().toISOString(),
                source: "hr",
            })));

            return NextResponse.json({ message: `${validIds.length} candidates hired` });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        console.error("[bulk-action] error:", error);
        return NextResponse.json({ error: "Failed to perform bulk action" }, { status: 500 });
    }
}
