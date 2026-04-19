import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveVerifiedSender } from "@/lib/mail";
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
    try {
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        // 1. Find user & Verify Role (Restriction: Only for Admins as requested)
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase().trim() },
            select: { id: true, role: true, name: true, orgId: true }
        });

        // Security note: We always return 'success' to prevent email enumeration,
        // but for this specific Super Admin request, we can be more explicit if it's easier to debug.
        // The user restricted it to 'Admin', so we check role.
        if (!user || user.role !== "ORG_ADMIN") {
            // Even if role doesn't match, we might want to fail silently or return a generic success.
            // But per user's "only for admin" request, we block here.
            return NextResponse.json({ error: "Access denied. Only Org Admins can reset passwords via this portal." }, { status: 403 });
        }

        // 2. Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // 3. Save OTP to DB
        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetOtp: otp,
                resetOtpExpires: expires
            }
        });

        // 4. Send Email
        const { from } = await resolveVerifiedSender(); // Uses platform sender
        const subject = "Security Code: Lumoscale Account Recovery";
        const html = `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 24px; background: #ffffff;">
                <h1 style="color: #111827; font-size: 24px; font-weight: 800; margin-bottom: 8px;">Recovery Code</h1>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin-bottom: 30px;">
                    Hi ${user.name || "Admin"}, you requested to reset your password. Use the verification code below to proceed:
                </p>
                <div style="background: #fdf2f0; padding: 24px; border-radius: 16px; text-align: center; border: 2px dashed #f97316;">
                    <span style="font-size: 32px; font-weight: 900; color: #f97316; letter-spacing: 0.2em;">${otp}</span>
                </div>
                <p style="color: #9ca3af; font-size: 11px; margin-top: 30px; text-align: center;">
                    This code is valid for <strong>10 minutes</strong>. If you did not request this, please ignore this email or contact security.
                </p>
            </div>
        `;

        if (from) {
            await resend.emails.send({
                from,
                to: email,
                subject,
                html
            });
        } else {
            // Fallback for local testing or unconfigured domains
            const fallbackFrom = "Lumoscale Security <security@lumoscale.com>";
            await resend.emails.send({
                from: fallbackFrom,
                to: email,
                subject,
                html
            });
        }

        return NextResponse.json({ success: true, message: "Verification code sent to your mail." });
    } catch (error) {
        console.error("[FORGOT_PASSWORD_API_ERROR]", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
