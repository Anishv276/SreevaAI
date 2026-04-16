import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Resend } from "resend";
import { resolveVerifiedSender } from "@/lib/mail";
import { isRateLimited } from "@/lib/rate-limit";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        }

        const masterEmail = process.env.MASTER_ADMIN_EMAIL;
        if (!masterEmail) return NextResponse.json({ error: "Master identity not configured" }, { status: 500 });

        // ── RATE LIMITING ───────────────────────────────────
        const isLimited = await isRateLimited(`otp-send:${masterEmail}`, 5, 60);
        if (isLimited) {
            return NextResponse.json({ 
                error: "Too many security code requests. Please wait a minute.", 
                code: "RATE_LIMIT_EXCEEDED" 
            }, { status: 429 });
        }

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

        // Store OTP in VerificationToken table tied to current session user
        await prisma.verificationToken.create({
            data: {
                superAdminId: session.userId,
                token: otp,
                expires
            }
        });

        const sender = await resolveVerifiedSender();
        if (!sender.from) {
            return NextResponse.json({
                error: "No verified sender available for OTP emails",
                details: sender.reason || "Configure and verify a sender domain first."
            }, { status: 502 });
        }

        // ── LIVE EMAIL VIA RESEND TO MASTER IDENTITY ──────

        const { data, error: mailError } = await resend.emails.send({
            from: sender.from,
            to: masterEmail,
            subject: "🛡️ Master Access: 6-Digit Security Code",
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
                    <h2 style="font-weight: 800; tracking-tight;">Security Verification</h2>
                    <p style="color: #666;">Requested root-access change for master identity: <strong>${masterEmail}</strong></p>
                    <div style="background: #fdf2f2; border: 1px solid #fee2e2; padding: 30px; border-radius: 12px; text-align: center; margin: 40px 0;">
                        <span style="font-size: 32px; font-weight: 900; letter-spacing: 0.5em; color: #f97316;">${otp}</span>
                    </div>
                    <p style="font-size: 12px; color: #999;">This security code expires in 10 minutes. If you did not request this, please ignore this email.</p>
                </div>
            `
        });

        if (mailError) {
            console.error("Resend Dispatch Failed:", mailError);
            return NextResponse.json({ 
                error: "Mail Dispatch Failure", 
                details: mailError.message 
            }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: `Security code sent to ${masterEmail}` });
    } catch (error: any) {
        console.error("Critical Security Sequence Error:", error);
        return NextResponse.json({ error: error.message || "Root access initiation failed" }, { status: 500 });
    }
}
