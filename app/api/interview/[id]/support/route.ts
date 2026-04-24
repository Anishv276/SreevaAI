import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { sendSuperAdminGmailEmail } from "@/lib/google-auth";

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
            where: {
                OR: [{ id }, { applicationId: id }],
            },
            include: {
                application: {
                    include: {
                        drive: {
                            include: {
                                organization: {
                                    select: { id: true, name: true },
                                },
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

        const supportEmail = process.env.SUPPORT_EMAIL || "support@sreevaai.co";
        const orgName = interview.application?.drive?.organization?.name || "Sreeva AI";
        const driveTitle = interview.application?.drive?.title || "Interview";
        const subject = `[Interview Support] ${normalizedIssueAbout.slice(0, 80)}`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #111827;">
                <h2 style="margin: 0 0 16px; font-size: 20px;">Interview Support Request</h2>
                <p style="margin: 0 0 8px;"><strong>Name:</strong> ${normalizedName}</p>
                <p style="margin: 0 0 8px;"><strong>Email:</strong> ${normalizedEmail}</p>
                <p style="margin: 0 0 8px;"><strong>Organization:</strong> ${orgName}</p>
                <p style="margin: 0 0 8px;"><strong>Interview:</strong> ${driveTitle}</p>
                <p style="margin: 0 0 8px;"><strong>Interview ID:</strong> ${id}</p>
                <div style="margin-top: 20px; padding: 16px; background: #f8fafc; border-radius: 12px;">
                    <p style="margin: 0 0 8px; font-weight: 700;">Issue About</p>
                    <p style="margin: 0; white-space: pre-wrap;">${normalizedIssueAbout}</p>
                </div>
            </div>
        `;

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

        const sender = await prisma.superAdmin.findFirst({
            where: { googleAccessToken: { not: null } },
            select: { id: true },
        });

        if (!sender) {
            console.warn("[INTERVIEW SUPPORT] No super admin Gmail sender available.");
            return NextResponse.json({
                success: true,
                emailSent: false,
                warning: "Support request received. Email delivery is not configured yet.",
                ticketId: ticket.id,
            });
        }

        try {
            await sendSuperAdminGmailEmail({
                adminId: sender.id,
                to: supportEmail,
                subject,
                html,
            });

            return NextResponse.json({
                success: true,
                emailSent: true,
                ticketId: ticket.id,
            });
        } catch (error) {
            console.error("Interview support email error:", error);
            return NextResponse.json({
                success: true,
                emailSent: false,
                warning: "Support request received, but email delivery failed.",
                ticketId: ticket.id,
            });
        }
    } catch (error) {
        console.error("Interview support request error:", error);
        return NextResponse.json({ error: "Failed to submit support request" }, { status: 500 });
    }
}
