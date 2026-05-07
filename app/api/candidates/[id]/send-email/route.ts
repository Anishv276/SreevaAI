import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendEmail } from "@/lib/resend";
import { getOrgBillingStatus } from "@/lib/credits";
import { getInterviewActionBlockedMessage, isInterviewQuotaLocked } from "@/lib/interview-quota";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { id } = await params;
        const orgId = session.orgId;

        if (session.role !== "SUPER_ADMIN" && !orgId) {
            return NextResponse.json({ error: "Unauthorized: Missing organization context" }, { status: 401 });
        }

        const application = await prisma.application.findFirst({
            where: {
                id,
                ...(session.role !== "SUPER_ADMIN" ? { drive: { orgId: orgId! } } : {})
            },
            include: { drive: { select: { title: true, orgId: true } } },
        });

        if (!application) {
            return NextResponse.json({ error: "Candidate not found or access denied" }, { status: 404 });
        }

        const { subject, body } = await request.json();
        if (!subject?.trim() || !body?.trim()) {
            return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
        }

        const escapeHtml = (unsafe: string) =>
            unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

        const resolvedBody = escapeHtml(body)
            .replace(/\{\{name\}\}/gi, application.fullName)
            .replace(/\{\{role\}\}/gi, (application as any).drive?.title || "the role")
            .replace(/\{\{email\}\}/gi, application.email);

        const targetOrgId = orgId || (application as any).drive?.orgId || undefined;

        const [org, billing] = await Promise.all([
            targetOrgId
                ? prisma.organization.findUnique({ where: { id: targetOrgId }, select: { status: true } })
                : Promise.resolve(null),
            targetOrgId ? getOrgBillingStatus(targetOrgId) : Promise.resolve(null),
        ]);

        if (org && billing) {
            const isSuspended = String(org.status || "").toUpperCase() === "SUSPENDED" || String(org.status || "").toUpperCase() === "CLOSED";
            const quotaLocked = isInterviewQuotaLocked(billing);
            if (isSuspended || quotaLocked) {
                return NextResponse.json(
                    {
                        error: getInterviewActionBlockedMessage(isSuspended),
                        code: isSuspended ? "ACCOUNT_SUSPENDED" : "NO_INTERVIEWS",
                    },
                    { status: isSuspended ? 403 : 402 }
                );
            }
        }

        const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px; background: #ffffff; color: #374151;">
                <div style="white-space: pre-wrap; font-size: 15px; line-height: 1.7;">${resolvedBody.replace(/\n/g, "<br/>")}</div>
                <hr style="border: none; border-top: 1px solid #F3F4F6; margin: 24px 0;" />
                <p style="color: #9CA3AF; font-size: 12px; margin: 0;">Sent via Sreeva AI Recruitment Platform</p>
            </div>
        `;

        await sendEmail({ to: application.email, subject, html });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[send-email]", error);
        return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }
}