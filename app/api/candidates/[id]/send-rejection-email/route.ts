import { NextResponse } from "next/server";
import { prisma, isLive } from "@/lib/prisma";
import { getSession, isAdminRole } from "@/lib/auth";
import { sendRejectionEmail } from "@/lib/mail";
import { appendCandidateActivity } from "@/lib/candidate-activity";
import { apiErrorResponse } from "@/lib/slack-error-logger";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getSession();
        if (!session || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { id: applicationId } = await context.params;
        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: {
                job: {
                    include: { organization: { select: { name: true, isDeleted: true } } },
                },
            },
        });
        if (!application || !isLive(application.job, application.job?.organization)) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }
        if (session.orgId && application.job?.organizationId !== session.orgId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (!application.candidateEmail) {
            return NextResponse.json({ error: "Candidate email is missing" }, { status: 400 });
        }
        const mailResult = await sendRejectionEmail({
            email: application.candidateEmail,
            fullName: application.candidateFullName,
            jobTitle: application.job?.title || "Unknown Role",
            orgName: application.job?.organization?.name || "Sreeva AI",
        });
        if (!mailResult.success) {
            return NextResponse.json({ error: mailResult.error }, { status: 500 });
        }
        await appendCandidateActivity(applicationId, {
            type: "email_sent",
            label: "Rejection email sent",
            details: `Sent at ${new Date().toISOString()}`,
            timestamp: new Date().toISOString(),
            source: "system",
        });
        return NextResponse.json({ success: true, message: "Rejection email sent successfully" });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/candidates/[id]/send-rejection-email",
            method: "POST",
            error,
            body: { error: "Failed to send rejection email" },
            status: 500,
            logLabel: "[send-rejection-email]",
        });
    }
}
