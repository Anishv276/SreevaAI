/**
 * app/api/demo/otp/send/route.ts
 * ────────────────────────────────
 * POST → Validate business email (MX + disposable-domain check), then send
 * a 6-digit code to prove the visitor actually controls that inbox.
 * No auth required -- public endpoint, gated by rate limiting.
 *
 * Body: { email, name }
 */
import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { isRateLimited } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/email";
import { hashOtp } from "@/lib/otp";
import { sendDemoOtpEmail } from "@/lib/mail";
import { isBusinessEmail } from "@/lib/demo-email-gate";
import { apiErrorResponse } from "@/lib/slack-error-logger";

export async function POST(request: Request) {
    try {
        const { email, name } = await request.json();
        if (!email || typeof email !== "string") {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }
        const normalizedEmail = normalizeEmail(email);

        const isLimited = await isRateLimited(`demo-otp-send:${normalizedEmail}`, 5, 60, true);
        if (isLimited) {
            return NextResponse.json({
                error: "Too many code requests. Please wait a minute and try again.",
                code: "RATE_LIMIT_EXCEEDED",
            }, { status: 429 });
        }

        if (!(await isBusinessEmail(normalizedEmail))) {
            return NextResponse.json({
                error: "Please use a valid work email address (not a personal or disposable email).",
                code: "PERSONAL_EMAIL",
            }, { status: 400 });
        }

        // CSPRNG -- Math.random() is not secure for a code guarding access.
        const otp = randomInt(100000, 1000000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const otpHash = hashOtp(otp);

        await prisma.demoEmailVerification.upsert({
            where: { email: normalizedEmail },
            create: { email: normalizedEmail, otpHash, expiresAt, verified: false },
            update: { otpHash, expiresAt, verified: false },
        });

        await sendDemoOtpEmail({
            to: normalizedEmail,
            name: typeof name === "string" && name.trim() ? name.trim() : "there",
            otp,
        });

        return NextResponse.json({ success: true, message: `Verification code sent to ${normalizedEmail}` });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/demo/otp/send",
            method: "POST",
            error,
            body: { error: "Failed to send verification code" },
            status: 500,
            logLabel: "[DEMO/OTP/SEND] error:",
        });
    }
}
