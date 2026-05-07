import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isRateLimited } from "@/lib/rate-limit";
import { sendSuperAdminGmailEmail, sendGmailEmail } from "@/lib/google-auth";

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        }

        let targetEmail = "";
        let isSuperAdmin = session.role === "SUPER_ADMIN";

        if (isSuperAdmin) {
            targetEmail = process.env.MASTER_ADMIN_EMAIL || "";
            if (!targetEmail) return NextResponse.json({ error: "Master identity not configured" }, { status: 500 });
        } else {
            // Regular Admin or User
            const user = await prisma.user.findUnique({
                where: { id: session.userId },
                select: { email: true }
            });
            if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
            targetEmail = user.email;
        }

        // -- RATE LIMITING -----------------------------------
        const isLimited = await isRateLimited(`otp-send:${targetEmail}`, 5, 60);
        if (isLimited) {
            return NextResponse.json({ 
                error: "Too many security code requests. Please wait a minute.", 
                code: "RATE_LIMIT_EXCEEDED" 
            }, { status: 429 });
        }

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

        // Store OTP based on role
        if (isSuperAdmin) {
            await prisma.verificationToken.create({
                data: {
                    superAdminId: session.userId,
                    token: otp,
                    expires
                }
            });
        } else {
            await prisma.user.update({
                where: { id: session.userId },
                data: {
                    resetOtp: otp,
                    resetOtpExpires: expires
                }
            });
        }

        // -- PREPARE EMAIL CONTENT --------------------------
        const subject = "🛡️ Security Verification: 6-Digit Code";
        const html = `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 24px; background: #ffffff;">
                <h1 style="color: #111827; font-size: 24px; font-weight: 800; margin-bottom: 8px;">Security Code</h1>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin-bottom: 30px;">
                    Enter the code below to authorize your password change for <strong>${targetEmail}</strong>:
                </p>
                <div style="background: #fdf2f0; padding: 24px; border-radius: 16px; text-align: center; border: 2px dashed #f97316;">
                    <span style="font-size: 32px; font-weight: 900; color: #f97316; letter-spacing: 0.2em;">${otp}</span>
                </div>
                <p style="color: #9ca3af; font-size: 11px; margin-top: 30px; text-align: center;">
                    This code is valid for <strong>10 minutes</strong>. If you did not request this, please ignore this email.
                </p>
            </div>
        `;

        // -- SEND EMAIL USING PRIORITY LOGIC ----------------
        try {
            if (isSuperAdmin) {
                // Super Admin always uses their own connected account
                const superAdmin = await prisma.superAdmin.findUnique({
                    where: { id: session.userId },
                    select: { id: true, googleAccessToken: true }
                });

                if (superAdmin?.googleAccessToken) {
                    await sendSuperAdminGmailEmail({
                        adminId: superAdmin.id,
                        to: targetEmail,
                        subject,
                        html
                    });
                } else {
                    return NextResponse.json({ error: "Super Admin Google connection is not active." }, { status: 502 });
                }
            } else {
                // Regular Admin uses Org Sender with Super Admin Fallback
                const currentUser = await prisma.user.findUnique({
                    where: { id: session.userId },
                    select: { orgId: true }
                });

                if (currentUser?.orgId) {
                    const organization = await prisma.organization.findUnique({
                        where: { id: currentUser.orgId },
                        select: { googleAccessToken: true }
                    });

                    if (organization?.googleAccessToken) {
                        await sendGmailEmail({
                            orgId: currentUser.orgId,
                            to: targetEmail,
                            subject,
                            html
                        });
                    } else {
                        // Fallback to platform sender
                        const connectedSuperAdmin = await prisma.superAdmin.findFirst({
                            where: { googleAccessToken: { not: null } },
                            select: { id: true }
                        });
                        if (connectedSuperAdmin) {
                            await sendSuperAdminGmailEmail({
                                adminId: connectedSuperAdmin.id,
                                to: targetEmail,
                                subject,
                                html
                            });
                        } else {
                            return NextResponse.json({ error: "Platform email service is not configured." }, { status: 502 });
                        }
                    }
                }
            }

            return NextResponse.json({ success: true, message: `Security code sent to ${targetEmail}` });
        } catch (dispatchError) {
            console.error("OTP Dispatch Failed:", dispatchError);
            const err = dispatchError as { message?: string; code?: string; reconnectRequired?: boolean };
            return NextResponse.json({
                error: err.reconnectRequired
                    ? "Reconnect Gmail and grant the missing permissions so the security code can be sent."
                    : "Failed to send security code. Please check your email configuration.",
                code: err.code || "GMAIL_SEND_FAILED",
                reconnectRequired: Boolean(err.reconnectRequired),
                details: err.message,
            }, { status: err.reconnectRequired ? 502 : 500 });
        }
    } catch (error: any) {
        console.error("Critical OTP Send Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
