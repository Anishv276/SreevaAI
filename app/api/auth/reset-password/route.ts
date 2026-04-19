import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
    try {
        const { email, otp, newPassword } = await request.json();

        if (!email || !otp || !newPassword) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // 1. Re-verify OTP for security in the final step
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase().trim() },
            select: { 
                id: true, 
                resetOtp: true, 
                resetOtpExpires: true 
            }
        });

        if (!user || user.resetOtp !== otp) {
            return NextResponse.json({ error: "Unauthorized reset attempt" }, { status: 403 });
        }

        const isExpired = user.resetOtpExpires && user.resetOtpExpires.getTime() < Date.now();
        if (isExpired) {
            return NextResponse.json({ error: "Session expired. Request a new code." }, { status: 400 });
        }

        // 2. Hash New Password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 3. Update User and Clear OTP
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetOtp: null,
                resetOtpExpires: null
            }
        });

        return NextResponse.json({ success: true, message: "Password updated successfully." });
    } catch (error) {
        console.error("[RESET_PASSWORD_API_ERROR]", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
