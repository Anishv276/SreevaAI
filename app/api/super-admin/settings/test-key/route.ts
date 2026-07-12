import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isRateLimited } from "@/lib/rate-limit";
import { sendPasswordChangeOtpEmail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/email";
import { hashOtp, verifyOtp } from "@/lib/otp";
import { apiErrorResponse } from "@/lib/slack-error-logger";

async function requireSuperAdmin() {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") return null;
    return session;
}

// GET: whether a test key is currently set (never returns the key itself).
export async function GET() {
    const session = await requireSuperAdmin();
    if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

    const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" }, select: { testAccessKey: true } });
    return NextResponse.json({ isSet: !!settings?.testAccessKey });
}

// POST: send an OTP to the super admin's email to authorize a test key change.
export async function POST() {
    const session = await requireSuperAdmin();
    if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

    const targetEmail = normalizeEmail(process.env.MASTER_ADMIN_EMAIL || "");
    if (!targetEmail) return NextResponse.json({ error: "Master identity not configured" }, { status: 500 });

    const isLimited = await isRateLimited(`otp-send:test-key:${targetEmail}`, 5, 60);
    if (isLimited) {
        return NextResponse.json({ error: "Too many security code requests. Please wait a minute.", code: "RATE_LIMIT_EXCEEDED" }, { status: 429 });
    }

    const otp = randomInt(100000, 1000000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    const otpHash = hashOtp(otp);
    await prisma.appSettings.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", testAccessKeyOtp: otpHash, testAccessKeyOtpExpiresAt: expires },
        update: { testAccessKeyOtp: otpHash, testAccessKeyOtpExpiresAt: expires },
    });

    try {
        await sendPasswordChangeOtpEmail({ to: targetEmail, otp });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/super-admin/settings/test-key",
            method: "POST",
            error,
            body: { error: "Failed to send security code. Please try again." },
            status: 500,
            logLabel: "[TEST_KEY_OTP_SEND] Email send failed:",
        });
    }
    return NextResponse.json({ success: true, message: `Security code sent to ${targetEmail}` });
}

// PATCH: verify OTP and update the test access key.
export async function PATCH(request: Request) {
    const session = await requireSuperAdmin();
    if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

    const { newKey, otp } = await request.json();
    if (!newKey || typeof newKey !== "string" || newKey.trim().length < 4) {
        return NextResponse.json({ error: "Key must be at least 4 characters" }, { status: 400 });
    }
    if (!otp) return NextResponse.json({ error: "Security code (OTP) required" }, { status: 400 });

    const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
    if (!settings || !verifyOtp(otp, settings.testAccessKeyOtp) || (settings.testAccessKeyOtpExpiresAt && settings.testAccessKeyOtpExpiresAt < new Date())) {
        return NextResponse.json({ error: "Invalid or expired security code" }, { status: 400 });
    }

    await prisma.appSettings.update({
        where: { id: "singleton" },
        data: { testAccessKey: newKey.trim(), testAccessKeyOtp: null, testAccessKeyOtpExpiresAt: null },
    });

    return NextResponse.json({ success: true, message: "Test access key updated" });
}
