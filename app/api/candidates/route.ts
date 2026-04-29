import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bulkDeleteCandidatesSchema } from "@/lib/validation";
import { getSession } from "@/lib/auth";
import { deleteCandidateEmbeddings } from "@/lib/pinecone";
import { deleteUrlTargets } from "@/lib/delete-utils";

/**
 * GET handler to fetch and filter candidates for a specific drive.
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
        const driveId = searchParams.get("driveId");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const search = searchParams.get("search")?.trim() || "";
        const resumeStatus = searchParams.get("resumeStatus") || searchParams.get("status") || "all";
        const interviewStatus = searchParams.get("interviewStatus") || "all";
        const hiringStatus = searchParams.get("hiringStatus") || "all";
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
                case "not hired":
                    return ["not hired", "NOT HIRED", "Not Hired"];
                case "not qualified":
                    return ["not qualified", "NOT QUALIFIED", "Not Qualified"];
                case "pending":
                    return ["pending", "PENDING", "Pending"];
                default:
                    return [value, normalized];
            }
        };

        const baseSelect = `
            SELECT a.*, d.title AS "driveTitle"
            FROM "Application" a
            JOIN "Drive" d ON d.id = a."driveId"
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
            drive: { orgId }
        };

        if (driveId && driveId !== "all") {
            where.driveId = driveId;
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }

        if (resumeStatus && resumeStatus !== "all") {
            where.resumeStatus = { in: statusVariants(resumeStatus) };
        }

        if (interviewStatus && interviewStatus !== "all") {
            where.interviewStatus = { in: statusVariants(interviewStatus) };
        }

        if (hiringStatus && hiringStatus !== "all") {
            where.hiringStatus = { in: statusVariants(hiringStatus) };
        }

        if (search) {
            where.OR = [
                { fullName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { drive: { title: { contains: search, mode: "insensitive" } } }
            ];
        }

        const [candidates, total, statsResult] = await Promise.all([
            prisma.application.findMany({
                where,
                include: {
                    drive: { select: { title: true, role: true } }
                },
                orderBy:
                    sortBy === "score"
                        ? [
                            { aiScore: { sort: sortDir, nulls: "last" } },
                            { updatedAt: "desc" }
                        ]
                        : { updatedAt: "desc" },
                skip: offset,
                take: limit,
            }),
            prisma.application.count({ where }),
            prisma.application.groupBy({
                by: ['resumeStatus', 'hiringStatus', 'interviewStatus'],
                where: {
                    drive: { orgId, ...(driveId && driveId !== "all" ? { id: driveId } : {}) }
                },
                _count: { _all: true }
            })
        ]);

        // Aggregate stats manually from groupBy result
        const statsRow = {
            shortlisted: 0,
            rejected: 0,
            hired: 0,
            not_hired: 0,
            interviewRunning: 0,
            interviewPending: 0,
            interviewCompleted: 0
        };

        statsResult.forEach((group: any) => {
            const count = group._count._all;
            const resStatus = (group.resumeStatus || "").toLowerCase();
            const hiStatus = (group.hiringStatus || "").toLowerCase();
            const intStatus = (group.interviewStatus || "").toLowerCase();

            if (resStatus === 'shortlisted') statsRow.shortlisted += count;
            if (resStatus === 'rejected') statsRow.rejected += count;
            if (hiStatus === 'hired') statsRow.hired += count;
            if (hiStatus === 'not hired') statsRow.not_hired += count;
            if (intStatus === 'inprogress') statsRow.interviewRunning += count;
            if (intStatus === 'pending') statsRow.interviewPending += count;
            if (intStatus === 'finished' || intStatus === 'completed') statsRow.interviewCompleted += count;
        });

        if (candidates.length > 0) {

        }

        const formattedCandidates = (candidates as any[]).map((app: any) => {
            return {
                id: app.id,
                driveId: app.driveId,
                fullName: app.fullName,
                name: app.fullName,
                email: app.email,
                role: app.drive?.role || app.drive?.title || "Unknown Role",
                score: app.aiScore || 0,
                status: app.resumeStatus,
                interviewStatus: app.interviewStatus,
                hiringStatus: app.hiringStatus,
                experienceYears: app.experienceYears,
                relevantYears: app.relevantYears,
                date: new Date(app.createdAt).toLocaleDateString(),
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
                hired: Number(statsRow.hired ?? 0),
                interviewRunning: Number(statsRow.interviewRunning ?? 0),
                interviewPending: Number(statsRow.interviewPending ?? 0),
                interviewCompleted: Number(statsRow.interviewCompleted ?? 0),
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
        const orgId = searchParams.get("orgId") || session?.orgId;

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
            drive: { orgId }
        };

        if (ids.length > 0) {
            whereClause.id = { in: ids };
        }

        const belongsToOrg = await prisma.application.findMany({
            where: whereClause,
            select: { id: true }
        });

        const validIds = belongsToOrg.map((a: (typeof belongsToOrg)[number]) => a.id);
        if (validIds.length === 0) return NextResponse.json({ message: "No matching candidates found" });

        try {
            const candidatesToCleanup = await prisma.application.findMany({
                where: { id: { in: validIds } },
                select: {
                    resumeUrl: true,
                    interview: {
                        select: {
                            interviewRecordingUrl: true,
                            snapshots: true
                        }
                    }
                }
            });

            const urls: string[] = [];
            for (const cand of candidatesToCleanup) {
                if (cand.resumeUrl) urls.push(cand.resumeUrl);
                if (cand.interview?.interviewRecordingUrl) urls.push(cand.interview.interviewRecordingUrl);
                if (cand.interview?.snapshots?.length) urls.push(...cand.interview.snapshots);
            }
            await deleteUrlTargets(urls);
        } catch (storageErr) {
            console.error("[DELETE_CANDIDATE_STORAGE_ERROR]:", storageErr);
        }

        // -- VECTOR DB CLEANUP: Purge from Pinecone ----------
        try {
            for (const cId of validIds) {
                await deleteCandidateEmbeddings(cId);
            }
        } catch (pineconeErr) {
             console.error("[BULK_DELETE_PINECONE_ERROR]:", pineconeErr);
        }

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

        await prisma.$transaction(async (tx) => {
            await tx.interview.deleteMany({
                where: { applicationId: { in: validIds } }
            });
            await tx.application.deleteMany({
                where: { id: { in: validIds } }
            });
        });

        return NextResponse.json({ message: `${validIds.length} candidates deleted successfully` });
    } catch (error) {
        console.error("Error bulk deleting candidates:", error);
        return NextResponse.json({ error: "Failed to delete candidates" }, { status: 500 });
    }
}
