import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Resend } from "resend";
import { resolveVerifiedSender } from "@/lib/mail";

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

        // ── AUTHORIZATION ─────────────────────────────────
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

        // ── XSS PROTECTION ─────────────────────────────────
        const escapeHtml = (unsafe: string) => {
            return unsafe
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
        };
        const safeBody = escapeHtml(body);

        // Resolve variables on sanitized output
        const resolvedBody = safeBody
            .replace(/\{\{name\}\}/gi, application.fullName)
            .replace(/\{\{role\}\}/gi, (application as any).drive?.title || "the role")
            .replace(/\{\{email\}\}/gi, application.email);

        const sender = await resolveVerifiedSender(orgId || (application as any).drive?.orgId || undefined);
        if (!sender.from) {
            return NextResponse.json({
                error: sender.reason || "No verified sender available for this organization"
            }, { status: 502 });
        }

        const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px; background: #ffffff; color: #374151;">
                <div style="white-space: pre-wrap; font-size: 15px; line-height: 1.7;">${resolvedBody.replace(/\n/g, "<br/>")}</div>
                <hr style="border: none; border-top: 1px solid #F3F4F6; margin: 24px 0;" />
                <p style="color: #9CA3AF; font-size: 12px; margin: 0;">Sent via Hirer.AI Recruitment Platform</p>
            </div>
        `;

        const payload = await resend.emails.send({ from: sender.from, to: application.email, subject, html });

        if (payload.error) {
            return NextResponse.json({ error: payload.error.message || "Email delivery failed" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[send-email]", error);
        return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }
}
