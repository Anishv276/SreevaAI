import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const orgId = searchParams.get("orgId");
        const search = searchParams.get("search")?.trim() || "";
        const dateRange = searchParams.get("dateRange") || "all";
        const dateFrom = searchParams.get("dateFrom");
        const dateTo = searchParams.get("dateTo");
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "10");
        const offset = (page - 1) * limit;

        if (!orgId) {
            return NextResponse.json({ error: "orgId required" }, { status: 400 });
        }

        const where: any = {
            application: {
                job: { organizationId: orgId }
            },
            isDeleted: false
        };

        if (dateRange !== "all") {
            const now = new Date();
            let startDate: Date;
            let endDate: Date = new Date();

            if (dateRange === "today") {
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            } else if (dateRange === "week") {
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 7);
            } else if (dateRange === "month") {
                startDate = new Date();
                startDate.setMonth(startDate.getMonth() - 1);
            } else if (dateRange === "custom" && dateFrom && dateTo) {
                startDate = new Date(dateFrom + "T00:00:00");
                endDate = new Date(dateTo + "T23:59:59");
            } else {
                startDate = new Date(0);
            }

            where.interviewCompletedAt = {
                gte: startDate,
                lte: endDate
            };
        }

        if (search) {
            where.application = {
                ...where.application,
                OR: [
                    { candidateFullName: { contains: search, mode: "insensitive" } },
                    { candidateEmail: { contains: search, mode: "insensitive" } },
                    { job: { title: { contains: search, mode: "insensitive" } } }
                ]
            };
        }

        const [interviews, total] = await Promise.all([
            prisma.interview.findMany({
                where,
                include: {
                    application: {
                        select: {
                            candidateFullName: true,
                            candidateEmail: true,
                            id: true,
                            job: {
                                select: { title: true, jobRole: true }
                            }
                        }
                    }
                },
                orderBy: { interviewCreatedAt: "desc" },
                skip: offset,
                take: limit,
            }),
            prisma.interview.count({ where })
        ]);

        const history = interviews.map(inv => ({
            id: inv.id,
            candidateName: inv.application.candidateFullName,
            candidateEmail: inv.application.candidateEmail,
            applicationId: inv.application.id,
            role: inv.application.job?.jobRole || inv.application.job?.title || "Unknown Role",
            date: inv.interviewCompletedAt || inv.interviewUpdatedAt || inv.interviewCreatedAt,
            duration: inv.durationInSeconds || 0,
            status: inv.interviewStatus,
            interviewsCount: 1
        }));

        return NextResponse.json({
            history,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Super-admin billing history error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
