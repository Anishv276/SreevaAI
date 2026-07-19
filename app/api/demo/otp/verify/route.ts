/**
 * app/api/demo/otp/verify/route.ts
 * ───────────────────────────────────
 * POST → Verify the 6-digit code sent to the visitor's email.
 * On success, marks the DemoEmailVerification row as verified; the
 * /api/demo/start route checks this flag before creating a session.
 *
 * Body: { email, otp }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/email";
import { isRateLimited } from "@/lib/rate-limit";
import { verifyOtp } from "@/lib/otp";

export async function POST(request: Request) {
    try {
        const { email, otp } = await request.json();
        if (!email || !otp) {
            return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
        }
        const normalizedEmail = normalizeEmail(email);

        // Brute-force guard, fail closed -- a 6-digit code with no throttle is
        // guessable given enough attempts.
        const isLimited = await isRateLimited(`demo-otp-verify:${normalizedEmail}`, 10, 600, true);
        if (isLimited) {
            return NextResponse.json(
                { error: "Too many attempts. Please request a new code.", code: "RATE_LIMIT_EXCEEDED" },
                { status: 429 }
            );
        }

        const record = await prisma.demoEmailVerification.findUnique({ where: { email: normalizedEmail } });
        if (!record || !verifyOtp(otp, record.otpHash)) {
            return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
        }
        if (record.expiresAt.getTime() < Date.now()) {
            return NextResponse.json({ error: "Code has expired. Request a new one." }, { status: 400 });
        }

        await prisma.demoEmailVerification.update({
            where: { email: normalizedEmail },
            data: { verified: true },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[DEMO/OTP/VERIFY] error:", error);
        return NextResponse.json({ error: "Failed to verify code" }, { status: 500 });
    }
}
