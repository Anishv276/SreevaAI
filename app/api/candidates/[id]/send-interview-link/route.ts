import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendApplicationStatusEmail } from "@/lib/mail";
import { buildInterviewLink } from "@/lib/interview-links";
import { getSession, isAdminRole } from "@/lib/auth";
import { getOrgBillingStatus } from "@/lib/credits";
import { getInterviewQuotaSupportMessage } from "@/lib/interview-quota";
import { appendCandidateActivity } from "@/lib/candidate-activity";
import { generateId } from "@/lib/ids";
import { isInterviewTokenRequired } from "@/lib/interview-access";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const prismaAny = prisma as any;
        const session = await getSession();
        if (!session || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: applicationId } = await context.params;

        if (!applicationId) {
            console.error("[INTERVIEW] Missing applicationId in params");
            return NextResponse.json({ error: "Application ID required" }, { status: 400 });
        }

        const application = await prismaAny.application.findUnique({
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

        if (session.orgId && application.drive?.orgId !== session.orgId) {
            return NextResponse.json({ error: "Forbidden: Candidate belongs to another organization" }, { status: 403 });
        }

        if (session.orgId) {
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

        const driveDeadline = application.drive?.deadline ? new Date(application.drive.deadline) : null;

        const interviewRecord = await prismaAny.interview.upsert({
            where: { applicationId },
            update: {
                inviteSentAt: new Date(),
                status: "PENDING",
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
        const interviewLink = buildInterviewLink(baseUrl, applicationId, {
            token: isInterviewTokenRequired() ? interviewRecord.accessToken : null,
            orgName: application.drive?.organization?.name || "Sreeva AI",
        });

        const mailResult = await sendApplicationStatusEmail({
            email: application.email,
            fullName: application.fullName,
            jobTitle: application.drive?.title || "Unknown Role",
            orgName: application.drive?.organization?.name || "Sreeva AI",
            status: "SHORTLISTED",
            interviewLink,
            schedulingDeadline: (application.drive as any)?.deadline || undefined,
        });

        if (!mailResult.success) {
            return NextResponse.json({
                error: `Interview link email could not be sent: ${mailResult.error}`,
            }, { status: 500 });
        }

        await prismaAny.application.update({
            where: { id: applicationId },
            data: { interviewStatus: "pending", updatedAt: new Date() },
        });

        await appendCandidateActivity(applicationId, {
            type: "interview_invite_sent",
            label: "Interview link sent",
            details: `Sent at ${new Date().toISOString()}`,
            timestamp: new Date().toISOString(),
            source: "system",
        });

        return NextResponse.json({
            success: true,
            message: "Interview link sent successfully"
        });
    } catch (error) {
        console.error("[INTERVIEW LINK ERROR]:", error);
        return NextResponse.json({ error: "Failed to send interview link" }, { status: 500 });
    }
}
