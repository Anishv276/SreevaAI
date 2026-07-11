import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { bulkDeleteCandidatesSchema } from "@/lib/validation";
import { getSession } from "@/lib/auth";
import { deleteUrlTargets } from "@/lib/delete-utils";
import { getRecordingUrl } from "@/lib/recording-state";
/**
 * GET handler to fetch and filter candidates for a specific job.
 * Supports various query filters like status variants, date ranges, and sorting rules.
 * 
 * @param {Request} request - The standard incoming Next.js API request wrapper.
 * @returns {Promise<NextResponse>} Structured collection of candidate entities.
 */
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get("jobId");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const search = searchParams.get("search")?.trim() || "";
        const resumeStatus = searchParams.get("resumeStatus") || searchParams.get("status") || "all";
        const interviewStatus = searchParams.get("interviewStatus") || "all";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "10");
        const offset = (page - 1) * limit;
        const sortBy = searchParams.get("sortBy") || "updatedAt";
        const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
        const statusVariants = (value: string) => {
            const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ");
            switch (normalized) {
                case "shortlisted":
                case "accepted":
                    return ["shortlisted", "SHORTLISTED", "Shortlisted", "accepted", "ACCEPTED", "Accepted"];
                case "rejected":
                    return ["rejected", "REJECTED", "Rejected"];
                case "not shortlisted":
                    return ["not shortlisted", "NOT SHORTLISTED", "Not Shortlisted"];
                case "inprogress":
                case "in progress":
                    return ["inprogress", "in progress", "IN_PROGRESS", "IN PROGRESS", "In Progress"];
                case "completed":
                case "finished":
                    return ["completed", "COMPLETED", "Completed", "finished", "FINISHED", "Finished"];

                case "not qualified":
                    return ["not qualified", "NOT QUALIFIED", "Not Qualified"];
                case "pending":
                    return ["pending", "PENDING", "Pending"];
                case "waiting":
                    return ["waiting", "WAITING", "Waiting"];
                case "processing":
                    return ["processing", "PROCESSING", "Processing"];
                case "failed":
                    return ["failed", "FAILED", "Failed"];
                default:
                    return [value, normalized];
            }
        };
        const baseSelect = `
            SELECT a.*, d.title AS "jobTitle"
            FROM "Application" a
            JOIN "Job" d ON d.id = a."jobId"
        `;
        // -- Security & Filtering -------------------
        const isSuperAdmin = session?.role === "SUPER_ADMIN";
        const orgId = isSuperAdmin 
            ? (searchParams.get("orgId") || session?.orgId) 
            : session?.orgId;
        if (!orgId) {
            return NextResponse.json({ candidates: [], pagination: { total: 0, pages: 0, page, limit } });
        }
        // -- PRISMA QUERY BUILDER -------------------
        const where: any = {
            job: { organizationId: orgId }
        };
        if (jobId && jobId !== "all") {
            where.jobId = jobId;
        }
        if (startDate || endDate) {
            where.appliedAt = {};
            if (startDate) where.appliedAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.appliedAt.lte = end;
            }
        }
        if (resumeStatus && resumeStatus !== "all") {
            where.resumeScreeningStatus = { in: statusVariants(resumeStatus) };
        }
        if (interviewStatus && interviewStatus !== "all") {
            where.interviewPhaseStatus = { in: statusVariants(interviewStatus) };
        }
        if (search) {
            where.OR = [
                { candidateFullName: { contains: search, mode: "insensitive" } },
                { candidateEmail: { contains: search, mode: "insensitive" } },
                { job: { title: { contains: search, mode: "insensitive" } } }
            ];
        }
        const [candidates, total, statsResult] = await Promise.all([
            prisma.application.findMany({
                where,
                include: {
                    job: { select: { title: true, jobRole: true } },
                    interview: { select: { inviteEmailSentAt: true, interviewStatus: true, interviewCompletedAt: true, isTestSession: true } },
                },
                orderBy:
                    sortBy === "score"
                        ? [
                            { resumeAiScore: { sort: sortDir, nulls: "last" } },
                            { applicationUpdatedAt: "desc" }
                        ]
                        : { applicationUpdatedAt: "desc" },
                skip: offset,
                take: limit,
            }),
            prisma.application.count({ where }),
            prisma.application.groupBy({
                by: ['resumeScreeningStatus', 'interviewPhaseStatus'],
                where: {
                    job: { organizationId: orgId, ...(jobId && jobId !== "all" ? { id: jobId } : {}) }
                },
                _count: { _all: true }
            }),
        ]);
        // Aggregate stats manually from groupBy result
        const statsRow = {
            shortlisted: 0,
            rejected: 0,
            interviewRunning: 0,
            interviewPending: 0,
            interviewCompleted: 0,
            readyForHire: 0
        };
        statsResult.forEach((group: any) => {
            const count = group._count._all;
            const resStatus = (group.resumeScreeningStatus || "").toLowerCase();
            const intStatus = String(group.interviewPhaseStatus || "").toLowerCase().replace(/[_-]+/g, " ");
            if (resStatus === 'shortlisted') statsRow.shortlisted += count;
            if (resStatus === 'rejected') statsRow.rejected += count;
            if (intStatus === 'inprogress' || intStatus === 'in progress') statsRow.interviewRunning += count;
            if (intStatus === 'pending') statsRow.interviewPending += count;
            if (intStatus === 'finished' || intStatus === 'completed') statsRow.interviewCompleted += count;
            if (resStatus === 'shortlisted' && (intStatus === 'finished' || intStatus === 'completed')) {
                statsRow.readyForHire += count;
            }
        });
        const formattedCandidates = candidates.map((app) => {
            let progress = null as number | null;
            let stage = null as string | null;
            try {
                const report = app.resumeAiReport ? JSON.parse(app.resumeAiReport) : null;
                const p = Number(report?.processing?.progress);
                progress = Number.isFinite(p) ? p : null;
                stage = typeof report?.processing?.stage === "string" ? report.processing.stage : null;
            } catch {
                progress = null;
                stage = null;
            }
            return {
                id: app.id,
                jobId: app.jobId,
                fullName: app.candidateFullName,
                name: app.candidateFullName,
                email: app.candidateEmail,
                role: app.job?.jobRole || app.job?.title || "Unknown Role",
                score: app.resumeAiScore || 0,
                status: app.resumeScreeningStatus,
                interviewStatus: app.interview?.interviewStatus || app.interviewPhaseStatus,
                screeningProgress: progress,
                screeningStage: stage,
                inviteSentAt: app.interview?.inviteEmailSentAt ?? null,
                interview: app.interview ? {
                    completedAt: app.interview.interviewCompletedAt,
                    isTest: app.interview.isTestSession,
                } : null,
                createdAt: app.appliedAt,
                date: new Date(app.appliedAt).toLocaleDateString(),
            };
        });
        return NextResponse.json({
            candidates: formattedCandidates,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            stats: {
                shortlisted: Number(statsRow.shortlisted ?? 0),
                rejected: Number(statsRow.rejected ?? 0),
                interviewRunning: Number(statsRow.interviewRunning ?? 0),
                interviewPending: Number(statsRow.interviewPending ?? 0),
                interviewCompleted: Number(statsRow.interviewCompleted ?? 0),
                readyForHire: Number(statsRow.readyForHire ?? 0),
            }
        }, {
            headers: {
                'Cache-Control': 'private, no-store',
            }
        });
    } catch (error) {
        console.error("Error fetching candidates:", error);
        return NextResponse.json({ error: "Failed to fetch candidates" }, { status: 500 });
    }
}
/**
 * DELETE handler to purge candidate records in bulk.
 * Safeguards integrity constraints across external search clusters.
 * 
 * @param {Request} request - The standard incoming payload payload.
 * @returns {Promise<NextResponse>} Summary of operation success.
 */
export async function DELETE(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { searchParams } = new URL(request.url);
        // -- TENANT ISOLATION: only SUPER_ADMIN may target another org via query.
        // A regular admin is always scoped to their own org so they cannot pass
        // ?orgId=<victim_org> and bulk-delete another tenant's candidates.
        const isSuperAdmin = session.role === "SUPER_ADMIN";
        const orgId = isSuperAdmin
            ? (searchParams.get("orgId") || session.orgId)
            : session.orgId;
        let ids: string[] = [];
        try {
            const body = await request.json();
            const result = bulkDeleteCandidatesSchema.safeParse(body);
            if (result.success) {
                ids = result.data.ids;
            }
        } catch (e) {
            // No body provided
        }
        if (ids.length === 0 && !orgId) {
            return NextResponse.json({ error: "No candidates or organization specified for deletion" }, { status: 400 });
        }
        const whereClause: any = {
            job: { organizationId: orgId }
        };
        if (ids.length > 0) {
            whereClause.id = { in: ids };
        }
        const candidatesToCleanup = await prisma.application.findMany({
            where: whereClause,
            select: {
                id: true,
                resumeFileUrl: true,
                interview: {
                    select: {
                        sessionRecording: true,
                        proctoringSnapshotUrls: true
                    }
                }
            }
        });
        const validIds = candidatesToCleanup.map((a: (typeof candidatesToCleanup)[number]) => a.id);
        if (validIds.length === 0) return NextResponse.json({ message: "No matching candidates found" });
        // -- STORAGE CLEANUP: Skipped to preserve files for soft delete --
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
            console.warn("[DELETE] Could not clean queue jobs:", queueErr);
        }
        // -- SOFT DELETE: DATABASE CLEANUP (Cascading) ---------------------------
        await prisma.$transaction(async (tx) => {
            const timestamp = Date.now().toString();
            if (validIds.length > 0) {
                const idList = Prisma.join(validIds);
                // 1. Soft Delete Support Tickets FIRST (before Interview applicationId is renamed)
                await tx.$executeRaw`
                    UPDATE "SupportTicket" SET "ticketStatus" = 'DELETED'
                    WHERE "interviewId" IN (
                        SELECT "id" FROM "Interview" WHERE "applicationId" IN (${idList})
                    )
                `;
                // 2. Soft delete interviews (rename unique keys via Raw SQL)
                await tx.$executeRaw`
                    UPDATE "Interview"
                    SET "isDeleted" = true,
                        "applicationId" = 'del_' || ${timestamp} || '_' || "applicationId",
                        "candidateInviteToken" = 'del_' || ${timestamp} || '_' || "candidateInviteToken"
                    WHERE "applicationId" IN (${idList})
                `;
                // 3. Soft delete applications
                await tx.application.updateMany({
                    where: { id: { in: validIds } },
                    data: { isDeleted: true }
                });
            }
        });
        return NextResponse.json({ message: `${validIds.length} candidates deleted successfully` });
    } catch (error) {
        console.error("Error bulk deleting candidates:", error);
        return NextResponse.json({ error: "Failed to delete candidates" }, { status: 500 });
    }
}
