import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendOtpEmail } from "@/lib/mail";
import { isRateLimited } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/email";
export async function POST(request: Request) {
    try {
        const { email } = await request.json();
        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }
        const normalizedEmail = normalizeEmail(email);
        const isLimited = await isRateLimited(`otp:${normalizedEmail}`, 1, 30, true);
        if (isLimited) {
            return NextResponse.json({
                error: "Please wait 30 seconds before requesting another code."
            }, { status: 429 });
        }
        const superAdminRecord = await prisma.superAdmin.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                },
            },
            select: { id: true, name: true }
        });
        const userRecord = await prisma.user.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                },
            },
            select: { id: true, name: true, role: true, orgId: true }
        });
        if (!superAdminRecord && (!userRecord || userRecord.role !== "ADMIN")) {
            return NextResponse.json({ error: "Access denied. Only authorized accounts can reset passwords." }, { status: 403 });
        }
        // CSPRNG — Math.random() is not cryptographically secure and made the
        // 6-digit code predictable/brute-forceable.
        const otp = randomInt(100000, 1000000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000);
        if (superAdminRecord) {
            await prisma.superAdmin.update({
                where: { id: superAdminRecord.id },
                data: { resetOtp: otp, resetOtpExpires: expires }
            });
        } else if (userRecord) {
            await prisma.user.update({
                where: { id: userRecord.id },
                data: { resetOtp: otp, resetOtpExpires: expires }
            });
        }
        const name = superAdminRecord?.name || userRecord?.name || "Admin";
        try {
            await sendOtpEmail({ to: normalizedEmail, name, otp });
        } catch (error) {
            console.error("[FORGOT_PASSWORD] Email send failed:", error);
            return NextResponse.json({ error: "Failed to send recovery email. Please try again." }, { status: 500 });
        }
        return NextResponse.json({ success: true, message: "Verification code sent to your mail." });
    } catch (error) {
        console.error("[FORGOT_PASSWORD_API_ERROR]", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
