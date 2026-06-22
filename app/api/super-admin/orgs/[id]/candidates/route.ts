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
        const driveId = searchParams.get("driveId") || "";
        const resumeStatus    = searchParams.get("resumeStatus")    || "";
        const interviewStatus = searchParams.get("interviewStatus") || "";
        const startDate = searchParams.get("startDate") || "";
        const endDate   = searchParams.get("endDate")   || "";

        const where: any = {
            isDeleted: false,
            drive: { orgId, isDeleted: false },
        };

        if (driveId && driveId !== "all") {
            where.driveId = driveId;
        }
        if (resumeStatus && resumeStatus !== "all") {
            where.resumeStatus = { contains: resumeStatus, mode: "insensitive" };
        }
        if (interviewStatus && interviewStatus !== "all") {
            where.interviewStatus = { contains: interviewStatus, mode: "insensitive" };
        }
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate)   where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
        }
        if (search) {
            where.OR = [
                { fullName: { contains: search, mode: "insensitive" } },
                { email:    { contains: search, mode: "insensitive" } },
                { drive: { title: { contains: search, mode: "insensitive" } } },
            ];
        }

        const orgWhere = { isDeleted: false, drive: { orgId, isDeleted: false } };

        const [candidates, total, drives, shortlisted, rejected, interviewRunning, interviewPending, interviewCompleted] = await Promise.all([
            prisma.application.findMany({
                where,
                include: {
                    drive: { select: { id: true, title: true, role: true } },
                    interview: {
                        select: {
                            status: true,
                            completedAt: true,
                            inviteSentAt: true,
                            scoreBreakdown: true,
                        },
                    },
                },
                orderBy: { updatedAt: "desc" },
                skip: offset,
                take: limit,
            }),
            prisma.application.count({ where }),
            prisma.drive.findMany({
                where: { orgId, isDeleted: false },
                select: { id: true, title: true, role: true },
                orderBy: { createdAt: "desc" },
            }),
            prisma.application.count({ where: { ...orgWhere, resumeStatus: { contains: "shortlisted", mode: "insensitive" } } }),
            prisma.application.count({ where: { ...orgWhere, resumeStatus: { contains: "rejected", mode: "insensitive" } } }),
            prisma.application.count({ where: { ...orgWhere, interview: { status: { in: ["in_progress", "inprogress", "in progress"] } } } }),
            prisma.application.count({ where: { ...orgWhere, interview: { is: null } } }),
            prisma.application.count({ where: { ...orgWhere, interview: { status: { in: ["completed", "finished"] } } } }),
        ]);

        return NextResponse.json({
            candidates: candidates.map((a) => ({
                id:              a.id,
                fullName:        a.fullName,
                email:           a.email,
                phone:           a.phone,
                resumeUrl:       a.resumeUrl,
                aiScore:         a.aiScore,
                resumeStatus:    a.resumeStatus,
                interviewStatus: a.interviewStatus,
                createdAt:       a.createdAt,
                updatedAt:       a.updatedAt,
                driveId:         a.driveId,
                driveTitle:      a.drive?.title ?? null,
                driveRole:       a.drive?.role  ?? null,
                interview: a.interview ? {
                    status:         a.interview.status,
                    completedAt:    a.interview.completedAt,
                    inviteSentAt:   a.interview.inviteSentAt,
                    scoreBreakdown: a.interview.scoreBreakdown,
                } : null,
            })),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
            drives,
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
