import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendApplicationStatusEmail } from "@/lib/mail";
import { v4 as uuidv4 } from "uuid";
import { getSession, isAdminRole } from "@/lib/auth";
import { generateId } from "@/lib/ids";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { getOrgCreditStatus } from "@/lib/credits";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getSession();
        if (!session || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: applicationId } = await context.params;

        if (!applicationId) {
            console.error("[INTERVIEW] Missing applicationId in params");
            return NextResponse.json({ error: "Application ID required" }, { status: 400 });
        }

        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: {
                drive: true,
                interview: true
            }
        });

        if (!application) {
            console.error(`[INTERVIEW] Application not found for ID: ${applicationId}`);
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }

        if (session.orgId && application.drive?.orgId !== session.orgId) {
            return NextResponse.json({ error: "Forbidden: Candidate belongs to another organization" }, { status: 403 });
        }

        if (session.orgId) {
            const org = await prisma.organization.findUnique({
                where: { id: session.orgId },
                select: { status: true }
            });
            if (org?.status === "SUSPENDED" || org?.status === "CLOSED") {
                return NextResponse.json({ error: "Interview links are blocked because your organization is restricted." }, { status: 403 });
            }

            const creditStatus = await getOrgCreditStatus(session.orgId);
            if (creditStatus.creditsTotal > 0 && !creditStatus.hasSufficientCredits) {
                return NextResponse.json({ error: "Insufficient credits. Recharge to send interview links.", code: "NO_CREDITS" }, { status: 402 });
            }
        }

        const resumeStatus = (application.resumeStatus || "").toUpperCase();
        const hiringStatus = (application.hiringStatus || "").toUpperCase();
        const canSendAgain = ["SHORTLISTED", "ACCEPTED"].includes(resumeStatus) || ["SHORTLISTED", "ACCEPTED"].includes(hiringStatus);

        if (!canSendAgain) {
            console.error(`[INTERVIEW] Status mismatch. Resume: ${resumeStatus}, Hiring: ${hiringStatus}`);
            return NextResponse.json({
                error: `Only shortlisted candidates can receive a fresh interview link. Current statuses are resume="${application.resumeStatus}" and hiring="${application.hiringStatus}".`
            }, { status: 400 });
        }

        const newToken = uuidv4();
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

        if (application.interview) {
            await prisma.interview.update({
                where: { id: application.interview.id },
                data: {
                    accessToken: newToken,
                    expiresAt,
                    status: "PENDING",
                    startedAt: null,
                    completedAt: null,
                }
            });
        } else {
            await prisma.interview.create({
                data: {
                    id: generateId("int", application.fullName || applicationId),
                    applicationId,
                    accessToken: newToken,
                    expiresAt,
                    status: "PENDING",
                }
            });
        }

        const interviewBase = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/interview/${applicationId}`;
        const interviewLink = isInterviewTokenRequired()
            ? `${interviewBase}?token=${newToken}`
            : interviewBase;

        const mailResult = await sendApplicationStatusEmail({
            email: application.email,
            fullName: application.fullName,
            jobTitle: application.drive?.title || "Unknown Role",
            orgId: application.drive?.orgId ?? undefined,
            status: "ACCEPTED",
            score: application.aiScore || 0,
            interviewLink
        });

        if (!mailResult.success) {
            const reason =
                typeof mailResult.error === "string"
                    ? mailResult.error
                    : (mailResult.error as any)?.message || "Unknown email delivery error";
            return NextResponse.json({
                error: `Interview token refreshed, but email could not be sent: ${reason}`
            }, { status: 502 });
        }

        return NextResponse.json({
            success: true,
            message: "Interview link sent successfully",
            expiresAt: expiresAt.toISOString()
        });
    } catch (error) {
        console.error("[INTERVIEW LINK ERROR]:", error);
        return NextResponse.json({ error: "Failed to send interview link" }, { status: 500 });
    }
}
