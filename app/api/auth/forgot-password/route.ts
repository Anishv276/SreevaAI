import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSuperAdminGmailEmail, sendGmailEmail } from "@/lib/google-auth";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(request: Request) {
    try {
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const isLimited = await isRateLimited(`otp:${normalizedEmail}`, 1, 30);
        if (isLimited) {
            return NextResponse.json({ 
                error: "Please wait 30 seconds before requesting another code." 
            }, { status: 429 });
        }

        // 1. Identify Identity (SuperAdmin or OrgAdmin)
        const superAdminRecord = await prisma.superAdmin.findUnique({
            where: { email: normalizedEmail },
            select: { id: true, name: true, googleAccessToken: true }
        });

        const userRecord = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true, name: true, role: true, orgId: true }
        });

        if (!superAdminRecord && (!userRecord || userRecord.role !== "ORG_ADMIN")) {
            return NextResponse.json({ error: "Access denied. Only authorized accounts can reset passwords." }, { status: 403 });
        }

        // 2. Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // 3. Save OTP based on type
        if (superAdminRecord) {
            await prisma.verificationToken.create({
                data: {
                    superAdminId: superAdminRecord.id,
                    token: otp,
                    expires
                }
            });
        } else if (userRecord) {
            await prisma.user.update({
                where: { id: userRecord.id },
                data: {
                    resetOtp: otp,
                    resetOtpExpires: expires
                }
            });
        }

        // 4. Sender Selection Priority
        let senderFn = null;
        let senderArgs: any = null;

        if (superAdminRecord) {
            // Super Admin Priority: Must use their own connection
            if (superAdminRecord.googleAccessToken) {
                senderFn = sendSuperAdminGmailEmail;
                senderArgs = { adminId: superAdminRecord.id };
            } else {
                return NextResponse.json({ error: "Your Super Admin Google connection is not active. Please connect it first." }, { status: 502 });
            }
        } else if (userRecord && userRecord.orgId) {
            // Org Admin Priority: 1. Org 2. Fallback to Super Admin logic
            const organization = await prisma.organization.findUnique({
                where: { id: userRecord.orgId },
                select: { googleAccessToken: true }
            });

            if (organization?.googleAccessToken) {
                senderFn = sendGmailEmail;
                senderArgs = { orgId: userRecord.orgId };
            } else {
                // Fallback to ANY connected Super Admin
                const connectedSuperAdmin = await prisma.superAdmin.findFirst({
                    where: { googleAccessToken: { not: null } },
                    select: { id: true }
                });

                if (connectedSuperAdmin) {
                    senderFn = sendSuperAdminGmailEmail;
                    senderArgs = { adminId: connectedSuperAdmin.id };
                } else {
                    return NextResponse.json({ 
                        error: "No email sender is configured for your organization or the platform. Please contact support." 
                    }, { status: 502 });
                }
            }
        }

        // 5. Send Email
        const subject = "Security Code: Sreeva AI Account Recovery";
        const html = `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 24px; background: #ffffff;">
                <h1 style="color: #111827; font-size: 24px; font-weight: 800; margin-bottom: 8px;">Recovery Code</h1>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin-bottom: 30px;">
                    Hi ${(superAdminRecord?.name || userRecord?.name || "Admin")}, you requested to reset your password. Use the verification code below to proceed:
                </p>
                <div style="background: #fdf2f0; padding: 24px; border-radius: 16px; text-align: center; border: 2px dashed #f97316;">
                    <span style="font-size: 32px; font-weight: 900; color: #f97316; letter-spacing: 0.2em;">${otp}</span>
                </div>
                <p style="color: #9ca3af; font-size: 11px; margin-top: 30px; text-align: center;">
                    This code is valid for <strong>10 minutes</strong>. If you did not request this, please ignore this email or contact security.
                </p>
            </div>
        `;

        if (senderFn && senderArgs) {
            try {
                await senderFn({
                    ...senderArgs,
                    to: normalizedEmail,
                    subject,
                    html
                });
            } catch (error) {
                const err = error as { message?: string; code?: string; reconnectRequired?: boolean };
                return NextResponse.json({
                    error: err.reconnectRequired
                        ? "Reconnect Gmail and grant the missing permissions so password reset emails can send."
                        : err.message || "Failed to send recovery email",
                    code: err.code || "GMAIL_SEND_FAILED",
                    reconnectRequired: Boolean(err.reconnectRequired),
                }, { status: err.reconnectRequired ? 502 : 500 });
            }
        }

        return NextResponse.json({ success: true, message: "Verification code sent to your mail." });
    } catch (error) {
        console.error("[FORGOT_PASSWORD_API_ERROR]", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
