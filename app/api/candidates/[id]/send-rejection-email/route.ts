import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole } from "@/lib/auth";
import { sendRejectionEmail } from "@/lib/mail";
import { appendCandidateActivity } from "@/lib/candidate-activity";
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
                    include: { organization: { select: { name: true } } },
                },
            },
        });
        if (!application) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }
        if (session.orgId && application.job?.orgId !== session.orgId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (!application.email) {
            return NextResponse.json({ error: "Candidate email is missing" }, { status: 400 });
        }
        const mailResult = await sendRejectionEmail({
            email: application.email,
            fullName: application.fullName,
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
        console.error("[send-rejection-email]", error);
        return NextResponse.json({ error: "Failed to send rejection email" }, { status: 500 });
    }
}
