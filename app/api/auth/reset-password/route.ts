import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isRateLimited } from "@/lib/ratelimit";

export async function POST(request: Request) {
    try {
        const { email, otp, newPassword } = await request.json();

        if (!email || !otp || !newPassword) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const isLimited = await isRateLimited(`reset-otp:${normalizedEmail}`, 1, 30);
        if (isLimited) {
            return NextResponse.json({ 
                error: "Please wait 30 seconds between attempts to verify a security code." 
            }, { status: 429 });
        }

        // 1. Re-verify OTP for security in the final step (check both tables)
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase().trim() },
            select: { 
                id: true, 
                resetOtp: true, 
                resetOtpExpires: true,
                role: true
            }
        });

        const superAdmin = await prisma.superAdmin.findUnique({
            where: { email: email.toLowerCase().trim() },
            select: { id: true }
        });

        // 2. Hash New Password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        let isValidOtp = false;

        if (user) {
            const updatedUser = await prisma.user.updateMany({
                where: {
                    id: user.id,
                    resetOtp: otp,
                    resetOtpExpires: { gte: new Date() }
                },
                data: {
                    password: hashedPassword,
                    resetOtp: null,
                    resetOtpExpires: null
                }
            });
            if (updatedUser.count > 0) {
                isValidOtp = true;
                
                if (superAdmin) {
                    await prisma.superAdmin.update({
                        where: { id: superAdmin.id },
                        data: { password: hashedPassword }
                    });
                }
            }
        }

        if (!isValidOtp && superAdmin) {
            const deletedToken = await prisma.verificationToken.deleteMany({
                where: {
                    superAdminId: superAdmin.id,
                    token: otp,
                    expires: { gte: new Date() }
                }
            });
            if (deletedToken.count > 0) {
                isValidOtp = true;
                
                await prisma.superAdmin.update({
                    where: { id: superAdmin.id },
                    data: { password: hashedPassword }
                });

                if (user) {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: {
                            password: hashedPassword,
                            resetOtp: null,
                            resetOtpExpires: null
                        }
                    });
                }
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
