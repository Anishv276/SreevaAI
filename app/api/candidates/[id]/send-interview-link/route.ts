import { NextResponse } from "next/server";
import { prisma, isLive } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { sendScheduleInviteEmail } from "@/lib/mail";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { getOrgBillingStatus } from "@/lib/credits";
import { getInterviewQuotaSupportMessage } from "@/lib/interview-quota";
import { appendCandidateActivity } from "@/lib/candidate-activity";
import { generateId } from "@/lib/ids";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { apiErrorResponse } from "@/lib/slack-error-logger";
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
                job: {
                    include: {
                        organization: {
                            select: {
                                name: true,
                                isDeleted: true,
                            },
                        },
                    },
                },
                interview: true
            }
        });
        if (!application || !isLive(application.job, application.job?.organization)) {
            console.error(`[INTERVIEW] Application not found for ID: ${applicationId}`);
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }
        if (!isSuperAdmin && session.orgId && application.job?.organizationId !== session.orgId) {
            return NextResponse.json({ error: "Forbidden: Candidate belongs to another organization" }, { status: 403 });
        }
        if (!isSuperAdmin && session.orgId) {
            const billingStatus = await getOrgBillingStatus(session.orgId);
            if (billingStatus.totalInterviewsAllowed > 0 && !billingStatus.hasSufficientInterviews) {
                return NextResponse.json(
                    {
                        error: getInterviewQuotaSupportMessage("interviews"),
                        code: "NO_INTERVIEWS",
                    },
                    { status: 402 }
                );
            }
        }
        const resumeStatus = (application.resumeScreeningStatus || "").toUpperCase();
        // Allow: shortlisted/accepted (ATS flow), skipped/completed (interview-only flow)
        const canSendAgain =
            ["SHORTLISTED", "ACCEPTED", "SKIPPED", "COMPLETED"].includes(resumeStatus);
        if (!canSendAgain) {
            console.error(`[INTERVIEW] Status mismatch. Resume: ${resumeStatus}`);
            return NextResponse.json({
                error: `Candidate is not eligible for an interview link yet. Current resume status: "${application.resumeScreeningStatus}".`
            }, { status: 400 });
        }
        if (!application.candidateEmail) {
            return NextResponse.json({ error: "Candidate email is missing" }, { status: 400 });
        }
        const jobDeadline = application.job?.applicationDeadline ? new Date(application.job.applicationDeadline) : null;
        const interviewRecord = await prisma.interview.upsert({
            where: { applicationId },
            update: {
                inviteEmailSentAt: new Date(),
                interviewStatus: "PENDING",
                interviewScheduledAt: null,
                interviewStartedAt: null,
                interviewCompletedAt: null,
                inviteLinkExpiresAt: jobDeadline,
                isTestSession: false,
                aiInterviewBrief: Prisma.JsonNull,
            },
            create: {
                id: generateId("int", application.candidateFullName || applicationId),
                applicationId,
                inviteEmailSentAt: new Date(),
                interviewStatus: "PENDING",
                inviteLinkExpiresAt: jobDeadline,
                isTestSession: false,
            },
        });
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const scheduleLink = `${baseUrl}/schedule/${interviewRecord.candidateInviteToken}`;
        const mailResult = await sendScheduleInviteEmail({
            email: application.candidateEmail,
            fullName: application.candidateFullName || "Candidate",
            jobTitle: application.job?.title || "Unknown Role",
            orgName: application.job?.organization?.name || "Sreeva AI",
            scheduleLink,
        });

        if (!mailResult.success) {
            return NextResponse.json({
                error: `Schedule link email could not be sent: ${mailResult.error}`,
            }, { status: 500 });
        }
        await prisma.application.update({
            where: { id: applicationId },
            data: { interviewPhaseStatus: "pending", applicationUpdatedAt: new Date() },
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
        return apiErrorResponse({
            route: "/api/candidates/[id]/send-interview-link",
            method: "POST",
            error,
            body: { error: "Failed to send interview link" },
            status: 500,
            logLabel: "[INTERVIEW LINK ERROR]:",
        });
    }
}
