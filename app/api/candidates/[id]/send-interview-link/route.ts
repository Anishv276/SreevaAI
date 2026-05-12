import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendApplicationStatusEmail } from "@/lib/mail";
import { v4 as uuidv4 } from "uuid";
import { getSession, isAdminRole } from "@/lib/auth";
import { generateId } from "@/lib/ids";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { getOrgBillingStatus } from "@/lib/credits";
import { getInterviewQuotaSupportMessage, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { appendCandidateActivity } from "@/lib/candidate-activity";

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
            if (isOrgRestrictedStatus(org?.status)) {
                return NextResponse.json({ error: "Interview links are blocked because your organization is restricted." }, { status: 403 });
            }

            const billingStatus = await getOrgBillingStatus(session.orgId);
            if (billingStatus.interviewQuotaTotal > 0 && !billingStatus.hasSufficientInterviews) {
                return NextResponse.json(
                    {
                        error: getInterviewQuotaSupportMessage("interviews"),
                        code: "NO_INTERVIEWS",
                    },
                    { status: 402 }
                );
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

        if (!application.email) {
            return NextResponse.json({ error: "Candidate email is missing" }, { status: 400 });
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
                    scheduledAt: null,
                    slotId: null,
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

        const baseUrl = 'http://localhost:3000';
        const interviewBase = `${baseUrl}/interview/${applicationId}/schedule`;
        const interviewLink = isInterviewTokenRequired()
            ? `${interviewBase}?token=${newToken}`
            : interviewBase;

        const mailResult = await sendApplicationStatusEmail({
            email: application.email,
            fullName: application.fullName,
            jobTitle: application.drive?.title || "Unknown Role",
            status: "ACCEPTED",
            interviewLink
        });

        if (!mailResult.success) {
            return NextResponse.json({
                error: `Interview token refreshed, but email could not be sent: ${mailResult.error}`,
            }, { status: 500 });
        }

        await appendCandidateActivity(applicationId, {
            type: "interview_invite_sent",
            label: "Interview link sent",
            details: `Sent at ${new Date().toISOString()}`,
            timestamp: new Date().toISOString(),
            source: "system",
        });

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
