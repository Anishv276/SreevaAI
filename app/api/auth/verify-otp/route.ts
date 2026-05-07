import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
    try {
        const { email, otp } = await request.json();

        if (!email || !otp) {
            return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const superAdmin = await prisma.superAdmin.findUnique({
            where: { email: normalizedEmail },
            select: {
                id: true,
                resetOtp: true,
                resetOtpExpires: true
            }
        });

        if (superAdmin) {
            if (!superAdmin.resetOtp || superAdmin.resetOtp !== otp) {
                return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
            }

            const isExpired = superAdmin.resetOtpExpires && superAdmin.resetOtpExpires.getTime() < Date.now();
            if (isExpired) {
                return NextResponse.json({ error: "Code has expired. Request a new one." }, { status: 400 });
            }

            return NextResponse.json({ success: true, message: "Code verified." });
        }

        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: {
                id: true,
                resetOtp: true,
                resetOtpExpires: true
            }
        });

        if (!user || !user.resetOtp || user.resetOtp !== otp) {
            return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
        }

        const isExpired = user.resetOtpExpires && user.resetOtpExpires.getTime() < Date.now();
        if (isExpired) {
            return NextResponse.json({ error: "Code has expired. Request a new one." }, { status: 400 });
        }

        return NextResponse.json({ success: true, message: "Code verified." });
    } catch (error) {
        console.error("[VERIFY_OTP_API_ERROR]", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
