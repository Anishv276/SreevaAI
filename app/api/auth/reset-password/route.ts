import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
    try {
        const { email, otp, newPassword } = await request.json();

        if (!email || !otp || !newPassword) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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

        if (!user || (user.resetOtp !== otp)) {
            // Check verification token table for Super Admin if not found in User
            if (superAdmin) {
                const vt = await prisma.verificationToken.findFirst({
                    where: { 
                        superAdminId: superAdmin.id,
                        token: otp
                    }
                });
                if (!vt || vt.expires.getTime() < Date.now()) {
                    return NextResponse.json({ error: "Unauthorized reset attempt or expired code" }, { status: 403 });
                }
            } else {
                return NextResponse.json({ error: "Unauthorized reset attempt" }, { status: 403 });
            }
        } else {
            const isExpired = user.resetOtpExpires && user.resetOtpExpires.getTime() < Date.now();
            if (isExpired) {
                return NextResponse.json({ error: "Session expired. Request a new code." }, { status: 400 });
            }
        }

        // 2. Hash New Password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 3. Update both tables if applicable and Clear OTP
        const updatePromises = [];

        if (user) {
            updatePromises.push(prisma.user.update({
                where: { id: user.id },
                data: {
                    password: hashedPassword,
                    resetOtp: null,
                    resetOtpExpires: null
                }
            }));
        }

        if (superAdmin) {
            updatePromises.push(prisma.superAdmin.update({
                where: { id: superAdmin.id },
                data: { password: hashedPassword }
            }));
            
            // Also clear VerificationToken for Super Admin
            updatePromises.push(prisma.verificationToken.deleteMany({
                where: { superAdminId: superAdmin.id, token: otp }
            }));
        }

        await Promise.all(updatePromises);

        return NextResponse.json({ success: true, message: "Password updated successfully." });
    } catch (error) {
        console.error("[RESET_PASSWORD_API_ERROR]", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
