import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendScheduleInviteEmail, sendInterviewInviteEmail } from "@/lib/mail";
import { buildInterviewLink } from "@/lib/interview-links";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { getOrgBillingStatus } from "@/lib/credits";
import { getInterviewQuotaSupportMessage } from "@/lib/interview-quota";
import { appendCandidateActivity } from "@/lib/candidate-activity";
import { generateId } from "@/lib/ids";
import { isInterviewTokenRequired, isSchedulingGateBypassed } from "@/lib/interview-access";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getSession();
        if (!session || (!isAdminRole(session.role) && !isSuperAdminRole(session.role))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const isSuperAdmin = isSuperAdminRole(session.role);
        const { id: applicationId } = await context.params;
        if (!applicationId) {
            console.error("[INTERVIEW] Missing applicationId in params");
            return NextResponse.json({ error: "Application ID required" }, { status: 400 });
        }
        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: {
                drive: {
                    include: {
                        organization: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
                interview: true
            }
        });
        if (!application) {
            console.error(`[INTERVIEW] Application not found for ID: ${applicationId}`);
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }
        if (!isSuperAdmin && session.orgId && application.drive?.orgId !== session.orgId) {
            return NextResponse.json({ error: "Forbidden: Candidate belongs to another organization" }, { status: 403 });
        }
        if (!isSuperAdmin && session.orgId) {
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
        // Allow: shortlisted/accepted (ATS flow), skipped/completed (interview-only flow)
        const canSendAgain =
            ["SHORTLISTED", "ACCEPTED", "SKIPPED", "COMPLETED"].includes(resumeStatus);
        if (!canSendAgain) {
            console.error(`[INTERVIEW] Status mismatch. Resume: ${resumeStatus}`);
            return NextResponse.json({
                error: `Candidate is not eligible for an interview link yet. Current resume status: "${application.resumeStatus}".`
            }, { status: 400 });
        }
        if (!application.email) {
            return NextResponse.json({ error: "Candidate email is missing" }, { status: 400 });
        }
        const driveDeadline = application.drive?.deadline ? new Date(application.drive.deadline) : null;
        const interviewRecord = await prisma.interview.upsert({
            where: { applicationId },
            update: {
                inviteSentAt: new Date(),
                status: "PENDING",
                scheduledAt: null,
                startedAt: null,
                completedAt: null,
                expiresAt: driveDeadline,
                linkStatus: "ACTIVE",
            },
            create: {
                id: generateId("int", application.fullName || applicationId),
                applicationId,
                inviteSentAt: new Date(),
                status: "PENDING",
                expiresAt: driveDeadline,
                linkStatus: "ACTIVE",
            },
        });
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        let mailResult;
        if (isSchedulingGateBypassed()) {
            // ponytail: test mode — skip slot booking, send the direct interview link
            const interviewLink = buildInterviewLink(baseUrl, applicationId, { token: interviewRecord.accessToken });
            mailResult = await sendInterviewInviteEmail({
                email: application.email,
                fullName: application.fullName || "Candidate",
                jobTitle: application.drive?.title || "Unknown Role",
                orgName: application.drive?.organization?.name || "Sreeva AI",
                interviewLink,
                schedulingDeadline: driveDeadline,
            });
        } else {
            const scheduleLink = `${baseUrl}/schedule/${interviewRecord.accessToken}`;
            mailResult = await sendScheduleInviteEmail({
                email: application.email,
                fullName: application.fullName || "Candidate",
                jobTitle: application.drive?.title || "Unknown Role",
                orgName: application.drive?.organization?.name || "Sreeva AI",
                scheduleLink,
            });
        }

        if (!mailResult.success) {
            return NextResponse.json({
                error: `Schedule link email could not be sent: ${mailResult.error}`,
            }, { status: 500 });
        }
        await prisma.application.update({
            where: { id: applicationId },
            data: { interviewStatus: "pending", updatedAt: new Date() },
        });
        await appendCandidateActivity(applicationId, {
            type: "interview_invite_sent",
            label: "Schedule link sent",
            details: `Sent at ${new Date().toISOString()}`,
            timestamp: new Date().toISOString(),
            source: "system",
        });
        return NextResponse.json({
            success: true,
            message: "Schedule link sent successfully"
        });
    } catch (error) {
        console.error("[INTERVIEW LINK ERROR]:", error);
        return NextResponse.json({ error: "Failed to send interview link" }, { status: 500 });
    }
}
