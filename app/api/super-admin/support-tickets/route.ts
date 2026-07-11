import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
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
        const where: Prisma.SupportTicketWhereInput = {};
        if (status && status !== "ALL") {
            where.ticketStatus = status;
        }
        if (q) {
            where.OR = [
                { reporterName: { contains: q, mode: "insensitive" } },
                { reporterEmail: { contains: q, mode: "insensitive" } },
                { issueDescription: { contains: q, mode: "insensitive" } },
                {
                    interview: {
                        application: {
                            OR: [
                                { candidateFullName: { contains: q, mode: "insensitive" } },
                                { candidateEmail: { contains: q, mode: "insensitive" } },
                                {
                                    job: {
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
                orderBy: { ticketCreatedAt: "desc" },
                skip: offset,
                take: limit,
                include: {
                    interview: {
                        include: {
                            application: {
                                include: {
                                    job: {
                                        include: {
                                            organization: {
                                                select: { id: true, name: true, urlSlug: true, billingPlan: true },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            prisma.supportTicket.count({ where: { ...where, ticketStatus: "OPEN" } }),
            prisma.supportTicket.count({ where: { ...where, ticketStatus: "RESOLVED" } }),
            prisma.supportTicket.count({ where: { ...where, ticketStatus: "CLOSED" } }),
        ]);
        const missingApplicationIds = tickets
            .filter((ticket) => !ticket.interview && ticket.applicationId)
            .map((ticket) => ticket.applicationId as string);
        const applications = missingApplicationIds.length > 0
            ? await prisma.application.findMany({
                where: { id: { in: missingApplicationIds } },
                include: {
                    job: {
                        include: {
                            organization: {
                                select: { id: true, name: true, urlSlug: true, billingPlan: true },
                            },
                        },
                    },
                },
            })
            : [];
        const applicationsById = new Map(applications.map((application) => [application.id, application]));
        const enrichedTickets = tickets.map((ticket) => {
            if (!ticket.interview && ticket.applicationId) {
                const application = applicationsById.get(ticket.applicationId);
                if (application) {
                    return { ...ticket, interview: { application } };
                }
            }
            return ticket;
        });
        return NextResponse.json({
            tickets: enrichedTickets,
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
export async function PATCH(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }
        const body = await request.json();
        const { id, status } = body;
        if (!id || !status) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }
        const validStatuses = ["OPEN", "RESOLVED", "CLOSED"];
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }
        const ticket = await prisma.supportTicket.update({
            where: { id },
            data: {
                ticketStatus: status,
                ticketResolvedAt: status === "RESOLVED" || status === "CLOSED" ? new Date() : null
            },
        });
        return NextResponse.json(ticket);
    } catch (error) {
        console.error("Support ticket update error:", error);
        return NextResponse.json({ error: "Failed to update support ticket" }, { status: 500 });
    }
}
