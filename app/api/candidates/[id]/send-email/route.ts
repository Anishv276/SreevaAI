import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { id } = await params;
        const orgId = session.orgId;

        const application = await prisma.application.findFirst({
            where: { id, ...(session.role !== "SUPER_ADMIN" ? { drive: { orgId } } : {}) },
            include: { drive: { select: { title: true, orgId: true } } },
        });

        if (!application) {
            return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
        }

        const { subject, body } = await request.json();
        if (!subject?.trim() || !body?.trim()) {
            return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
        }

        // Resolve variables
        const resolvedBody = body
            .replace(/\{\{name\}\}/gi, application.fullName)
            .replace(/\{\{role\}\}/gi, (application as any).drive?.title || "the role")
            .replace(/\{\{email\}\}/gi, application.email);

        // Determine sender
        let from = process.env.FROM_EMAIL || "Lumoscale <careers@lumoscale.com>";
        if (orgId) {
            const org = await prisma.organization.findUnique({
                where: { id: orgId },
                select: { customSenderEmail: true, customSenderName: true, isDomainVerified: true, name: true },
            });
            if (org?.isDomainVerified && org?.customSenderEmail) {
                from = `${org.customSenderName || org.name} <${org.customSenderEmail}>`;
            }
        }

        const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px; background: #ffffff; color: #374151;">
                <div style="white-space: pre-wrap; font-size: 15px; line-height: 1.7;">${resolvedBody.replace(/\n/g, "<br/>")}</div>
                <hr style="border: none; border-top: 1px solid #F3F4F6; margin: 24px 0;" />
                <p style="color: #9CA3AF; font-size: 12px; margin: 0;">Sent via Hirer.AI Recruitment Platform</p>
            </div>
        `;

        const payload = await resend.emails.send({ from, to: application.email, subject, html });

        if (payload.error) {
            return NextResponse.json({ error: "Email delivery failed" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[send-email]", error);
        return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }
}
