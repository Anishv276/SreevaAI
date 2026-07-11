import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isRateLimited } from "@/lib/rate-limit";
import { invalidateUserSessions } from "@/lib/auth";
import { normalizeEmail } from "@/lib/email";
import { validatePasswordStrength } from "@/lib/validation";
import { verifyOtp } from "@/lib/otp";
export async function POST(request: Request) {
    try {
        const { email, otp, newPassword } = await request.json();
        if (!email || !otp || !newPassword) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }
        const normalizedEmail = normalizeEmail(email);
        const { isValid, error: passwordError } = validatePasswordStrength(String(newPassword));
        if (!isValid) {
            return NextResponse.json({ error: passwordError || "Password is too weak" }, { status: 400 });
        }
        const isLimited = await isRateLimited(`reset-otp:${normalizedEmail}`, 1, 30, true);
        if (isLimited) {
            return NextResponse.json({ 
                error: "Please wait 30 seconds between attempts to verify a security code." 
            }, { status: 429 });
        }
        // 1. Re-verify OTP for security in the final step (check both account types)
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
        const superAdmin = await prisma.superAdmin.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                },
            },
            select: { id: true, passwordResetOtp: true, passwordResetOtpExpiresAt: true }
        });
        // 2. Hash New Password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        let isValidOtp = false;
        if (user && verifyOtp(otp, user.passwordResetOtp) && user.passwordResetOtpExpiresAt && user.passwordResetOtpExpiresAt >= new Date()) {
            // Re-check the OTP hash in the where clause too, so a concurrent
            // otp-send request that changes the hash mid-request can't race
            // this update into applying a stale/already-superseded code.
            const updatedUser = await prisma.organizationCredentials.updateMany({
                where: {
                    id: user.id,
                    passwordResetOtp: user.passwordResetOtp,
                    passwordResetOtpExpiresAt: { gte: new Date() }
                },
                data: {
                    password: hashedPassword,
                    passwordResetOtp: null,
                    passwordResetOtpExpiresAt: null
                }
            });
            if (updatedUser.count > 0) {
                isValidOtp = true;
                await invalidateUserSessions(user.id);
            }
        }
        if (!isValidOtp && superAdmin && verifyOtp(otp, superAdmin.passwordResetOtp) && superAdmin.passwordResetOtpExpiresAt && superAdmin.passwordResetOtpExpiresAt >= new Date()) {
            const updatedAdmin = await prisma.superAdmin.updateMany({
                where: {
                    id: superAdmin.id,
                    passwordResetOtp: superAdmin.passwordResetOtp,
                    passwordResetOtpExpiresAt: { gte: new Date() }
                },
                data: {
                    password: hashedPassword,
                    passwordResetOtp: null,
                    passwordResetOtpExpiresAt: null
                }
            });
            if (updatedAdmin.count > 0) {
                isValidOtp = true;
                await invalidateUserSessions(superAdmin.id);
            }
        }
        if (!isValidOtp) {
            return NextResponse.json({ error: "Invalid or expired reset code" }, { status: 400 });
        }
        return NextResponse.json({ success: true, message: "Password updated successfully." });
    } catch (error) {
        console.error("[RESET_PASSWORD_API_ERROR]", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
