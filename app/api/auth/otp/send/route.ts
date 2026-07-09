import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isRateLimited } from "@/lib/rate-limit";
import { sendPasswordChangeOtpEmail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/email";
export async function POST() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        }
        let targetEmail = "";
        const isSuperAdmin = session.role === "SUPER_ADMIN";
        if (isSuperAdmin) {
            targetEmail = normalizeEmail(process.env.MASTER_ADMIN_EMAIL || "");
            if (!targetEmail) return NextResponse.json({ error: "Master identity not configured" }, { status: 500 });
        } else {
            const user = await prisma.organizationCredentials.findUnique({
                where: { id: session.userId },
                select: { email: true }
            });
            if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
            targetEmail = normalizeEmail(user.email);
        }
        const isLimited = await isRateLimited(`otp-send:${targetEmail}`, 5, 60);
        if (isLimited) {
            return NextResponse.json({
                error: "Too many security code requests. Please wait a minute.",
                code: "RATE_LIMIT_EXCEEDED"
            }, { status: 429 });
        }
        // CSPRNG -- see forgot-password route; Math.random() is not secure.
        const otp = randomInt(100000, 1000000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000);
        if (isSuperAdmin) {
            await prisma.superAdmin.update({
                where: { id: session.userId },
                data: { passwordResetOtp: otp, passwordResetOtpExpiresAt: expires }
            });
        } else {
            await prisma.organizationCredentials.update({
                where: { id: session.userId },
                data: { passwordResetOtp: otp, passwordResetOtpExpiresAt: expires }
            });
        }
        try {
            await sendPasswordChangeOtpEmail({ to: targetEmail, otp });
        } catch (error) {
            console.error("[OTP_SEND] Email send failed:", error);
            return NextResponse.json({ error: "Failed to send security code. Please try again." }, { status: 500 });
        }
        return NextResponse.json({ success: true, message: `Security code sent to ${targetEmail}` });
    } catch (error) {
        console.error("Critical OTP Send Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
