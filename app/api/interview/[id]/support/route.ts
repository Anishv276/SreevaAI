import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInterviewTokenRequired } from "@/lib/interview-access";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { name, email, issueAbout, interviewToken } = await request.json();

        const normalizedName = String(name || "").trim();
        const normalizedEmail = String(email || "").trim().toLowerCase();
        const normalizedIssueAbout = String(issueAbout || "").trim();
        const requireInterviewToken = isInterviewTokenRequired();

        if (!normalizedName) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
        }

        if (!normalizedIssueAbout) {
            return NextResponse.json({ error: "Issue description is required" }, { status: 400 });
        }

        const interview = await prisma.interview.findFirst({
            where: { OR: [{ id }, { applicationId: id }] },
            include: {
                application: {
                    include: {
                        drive: {
                            include: {
                                organization: { select: { id: true, name: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!interview) {
            return NextResponse.json({ error: "Interview not found" }, { status: 404 });
        }

        if (requireInterviewToken && interview.accessToken !== interviewToken) {
            return NextResponse.json({ error: "Unauthorized: Invalid support token" }, { status: 401 });
        }

        const ticket = await prisma.supportTicket.create({
            data: {
                interviewId: interview.id,
                applicationId: interview.applicationId,
                name: normalizedName,
                email: normalizedEmail,
                issueAbout: normalizedIssueAbout,
                status: "OPEN",
            },
        });

        return NextResponse.json({ success: true, ticketId: ticket.id });
    } catch (error) {
        console.error("Interview support request error:", error);
        return NextResponse.json({ error: "Failed to submit support request" }, { status: 500 });
    }
}