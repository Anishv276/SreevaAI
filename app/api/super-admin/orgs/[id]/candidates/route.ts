import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdminRole } from "@/lib/auth";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || !isSuperAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { id: orgId } = await params;
        const { searchParams } = new URL(request.url);

        const page    = Math.max(1, parseInt(searchParams.get("page")  || "1"));
        const limit   = Math.min(250, Math.max(1, parseInt(searchParams.get("limit") || "50")));
        const offset  = (page - 1) * limit;
        const search  = searchParams.get("search")?.trim() || "";
        const jobId = searchParams.get("jobId") || "";
        const resumeStatus    = searchParams.get("resumeStatus")    || "";
        const interviewStatus = searchParams.get("interviewStatus") || "";
        const startDate = searchParams.get("startDate") || "";
        const endDate   = searchParams.get("endDate")   || "";

        const where: any = {
            isDeleted: false,
            job: { organizationId: orgId, isDeleted: false },
        };

        if (jobId && jobId !== "all") {
            where.jobId = jobId;
        }
        if (resumeStatus && resumeStatus !== "all") {
            where.resumeScreeningStatus = { contains: resumeStatus, mode: "insensitive" };
        }
        if (interviewStatus && interviewStatus !== "all") {
            where.interviewPhaseStatus = { contains: interviewStatus, mode: "insensitive" };
        }
        if (startDate || endDate) {
            where.appliedAt = {};
            if (startDate) where.appliedAt.gte = new Date(startDate);
            if (endDate)   where.appliedAt.lte = new Date(endDate + "T23:59:59.999Z");
        }
        if (search) {
            where.OR = [
                { candidateFullName: { contains: search, mode: "insensitive" } },
                { candidateEmail:    { contains: search, mode: "insensitive" } },
                { job: { title: { contains: search, mode: "insensitive" } } },
            ];
        }

        const orgWhere = { isDeleted: false, job: { organizationId: orgId, isDeleted: false } };

        const [candidates, total, jobs, shortlisted, rejected, interviewRunning, interviewPending, interviewCompleted] = await Promise.all([
            prisma.application.findMany({
                where,
                include: {
                    job: { select: { id: true, title: true, jobRole: true } },
                    interview: {
                        select: {
                            interviewStatus: true,
                            interviewCompletedAt: true,
                            inviteEmailSentAt: true,
                            aiScoreBreakdown: true,
                        },
                    },
                },
                orderBy: { applicationUpdatedAt: "desc" },
                skip: offset,
                take: limit,
            }),
            prisma.application.count({ where }),
            prisma.job.findMany({
                where: { organizationId: orgId, isDeleted: false },
                select: { id: true, title: true, jobRole: true },
                orderBy: { jobCreatedAt: "desc" },
            }),
            prisma.application.count({ where: { ...orgWhere, resumeScreeningStatus: { contains: "shortlisted", mode: "insensitive" } } }),
            prisma.application.count({ where: { ...orgWhere, resumeScreeningStatus: { contains: "rejected", mode: "insensitive" } } }),
            prisma.application.count({ where: { ...orgWhere, interview: { interviewStatus: { in: ["LAUNCHING", "PROGRESS"] } } } }),
            prisma.application.count({ where: { ...orgWhere, interview: { is: null } } }),
            prisma.application.count({ where: { ...orgWhere, interview: { interviewStatus: "COMPLETED" } } }),
        ]);

        return NextResponse.json({
            candidates: candidates.map((a) => ({
                id:              a.id,
                fullName:        a.candidateFullName,
                email:           a.candidateEmail,
                phone:           a.candidatePhone,
                resumeUrl:       a.resumeFileUrl,
                aiScore:         a.resumeAiScore,
                resumeStatus:    a.resumeScreeningStatus,
                interviewStatus: a.interviewPhaseStatus,
                createdAt:       a.appliedAt,
                updatedAt:       a.applicationUpdatedAt,
                jobId:         a.jobId,
                jobTitle:      a.job?.title ?? null,
                jobRole:       a.job?.jobRole  ?? null,
                interview: a.interview ? {
                    status:         a.interview.interviewStatus,
                    completedAt:    a.interview.interviewCompletedAt,
                    inviteSentAt:   a.interview.inviteEmailSentAt,
                    scoreBreakdown: a.interview.aiScoreBreakdown,
                } : null,
            })),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
            jobs,
            stats: {
                shortlisted,
                rejected,
                interviewRunning,
                interviewPending,
                interviewCompleted,
            },
        });
    } catch (error) {
        console.error("[super-admin candidates] GET error:", error);
        return NextResponse.json({ error: "Failed to fetch candidates" }, { status: 500 });
    }
}
