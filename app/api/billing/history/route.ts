import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session || !session.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const orgId = session.orgId;
        const { searchParams } = new URL(request.url);
        
        const search = searchParams.get("search")?.trim() || "";
        const dateRange = searchParams.get("dateRange") || "all";
        const dateFrom = searchParams.get("dateFrom");
        const dateTo = searchParams.get("dateTo");
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "10");
        const offset = (page - 1) * limit;

        const where: any = {
            application: {
                job: { orgId }
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
                startDate = new Date(0); // Fallback
            }
            
            where.completedAt = {
                gte: startDate,
                lte: endDate
            };
        }

        if (search) {
            where.application = {
                ...where.application,
                OR: [
                    { fullName: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
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
                            fullName: true,
                            email: true,
                            id: true,
                            job: {
                                select: { title: true, role: true }
                            }
                        }
                    }
                },
                orderBy: { createdAt: "desc" },
                skip: offset,
                take: limit,
            }),
            prisma.interview.count({ where })
        ]);

        const history = interviews.map(inv => ({
            id: inv.id,
            candidateName: inv.application.fullName,
            candidateEmail: inv.application.email,
            applicationId: inv.application.id,
            role: inv.application.job?.role || inv.application.job?.title || "Unknown Role",
            date: inv.completedAt || inv.updatedAt || inv.createdAt,
            duration: inv.interviewDuration || 0,
            status: inv.status,
            interviewsCount: 1 // Single interview record
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
        console.error("Billing history error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
