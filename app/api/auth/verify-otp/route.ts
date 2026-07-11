import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/email";
import { isRateLimited } from "@/lib/rate-limit";
import { verifyOtp } from "@/lib/otp";
export async function POST(request: Request) {
    try {
        const { email, otp } = await request.json();
        if (!email || !otp) {
            return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });
        }
        const normalizedEmail = normalizeEmail(email);
        // -- BRUTE-FORCE GUARD (fail closed) --------------------------------
        // A 6-digit OTP with no throttle is brute-forceable. Cap verification
        // attempts per email; fail closed so a Redis outage can't open the door.
        const isLimited = await isRateLimited(`verify-otp:${normalizedEmail}`, 10, 600, true);
        if (isLimited) {
            return NextResponse.json(
                { error: "Too many attempts. Please request a new code.", code: "RATE_LIMIT_EXCEEDED" },
                { status: 429 }
            );
        }
        const superAdmin = await prisma.superAdmin.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                },
            },
            select: {
                id: true,
                passwordResetOtp: true,
                passwordResetOtpExpiresAt: true
            }
        });
        if (superAdmin) {
            if (!verifyOtp(otp, superAdmin.passwordResetOtp)) {
                return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
            }
            const isExpired = superAdmin.passwordResetOtpExpiresAt && superAdmin.passwordResetOtpExpiresAt.getTime() < Date.now();
            if (isExpired) {
                return NextResponse.json({ error: "Code has expired. Request a new one." }, { status: 400 });
            }
            return NextResponse.json({ success: true, message: "Code verified." });
        }
        const user = await prisma.organizationCredentials.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                },
            },
            select: {
                id: true,
                passwordResetOtp: true,
                passwordResetOtpExpiresAt: true
            }
        });
        if (!user || !verifyOtp(otp, user.passwordResetOtp)) {
            return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
        }
        const isExpired = user.passwordResetOtpExpiresAt && user.passwordResetOtpExpiresAt.getTime() < Date.now();
        if (isExpired) {
            return NextResponse.json({ error: "Code has expired. Request a new one." }, { status: 400 });
        }
        return NextResponse.json({ success: true, message: "Code verified." });
    } catch (error) {
        console.error("[VERIFY_OTP_API_ERROR]", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
