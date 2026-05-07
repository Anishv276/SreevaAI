import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendOtpEmail } from "@/lib/mail";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(request: Request) {
    try {
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const isLimited = await isRateLimited(`otp:${normalizedEmail}`, 1, 30);
        if (isLimited) {
            return NextResponse.json({
                error: "Please wait 30 seconds before requesting another code."
            }, { status: 429 });
        }

        const superAdminRecord = await prisma.superAdmin.findUnique({
            where: { email: normalizedEmail },
            select: { id: true, name: true }
        });

        const userRecord = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true, name: true, role: true, orgId: true }
        });

        if (!superAdminRecord && (!userRecord || userRecord.role !== "ORG_ADMIN")) {
            return NextResponse.json({ error: "Access denied. Only authorized accounts can reset passwords." }, { status: 403 });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000);

        if (superAdminRecord) {
            await prisma.verificationToken.create({
                data: { superAdminId: superAdminRecord.id, token: otp, expires }
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
