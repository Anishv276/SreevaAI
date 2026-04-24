import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
        const status = searchParams.get("status")?.trim().toUpperCase() || "";
        const q = searchParams.get("q")?.trim() || "";
        const offset = (page - 1) * limit;

        const where: Record<string, any> = {};
        if (status && status !== "ALL") {
            where.status = status;
        }
        if (q) {
            where.OR = [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { issueAbout: { contains: q, mode: "insensitive" } },
                {
                    interview: {
                        application: {
                            OR: [
                                { fullName: { contains: q, mode: "insensitive" } },
                                { email: { contains: q, mode: "insensitive" } },
                                {
                                    drive: {
                                        organization: {
                                            name: { contains: q, mode: "insensitive" },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            ];
        }

        const [total, tickets, openCount, resolvedCount, closedCount] = await prisma.$transaction([
            prisma.supportTicket.count({ where }),
            prisma.supportTicket.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: offset,
                take: limit,
                include: {
                    interview: {
                        include: {
                            application: {
                                include: {
                                    drive: {
                                        include: {
                                            organization: {
                                                select: { id: true, name: true, slug: true, plan: true },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            prisma.supportTicket.count({ where: { ...where, status: "OPEN" } }),
            prisma.supportTicket.count({ where: { ...where, status: "RESOLVED" } }),
            prisma.supportTicket.count({ where: { ...where, status: "CLOSED" } }),
        ]);

        return NextResponse.json({
            tickets,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
            stats: {
                total,
                openCount,
                resolvedCount,
                closedCount,
            },
        });
    } catch (error) {
        console.error("Support ticket fetch error:", error);
        return NextResponse.json({ error: "Failed to fetch support tickets" }, { status: 500 });
    }
}
