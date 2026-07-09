import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createSession, normalizeRole } from "@/lib/auth";
import { isRateLimited } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/email";
import { logLoginAttempt } from "@/lib/slack-error-logger";
// A pre-computed bcrypt hash of a random string. We compare against this when no
// user is found so the request spends the same time as a real bcrypt check -- 
// removing the timing oracle that otherwise reveals which emails are registered.
const DUMMY_BCRYPT_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
export async function POST(request: Request) {
    try {
        const { email, password } = await request.json();
        if (!email || !password) {
            return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
        }
        const normalizedEmail = normalizeEmail(email);
        // -- RATE LIMITING (fail closed: a Redis outage must not open brute force) --
        const isLimited = await isRateLimited(`login:${normalizedEmail}`, 5, 60, true);
        if (isLimited) {
            await logLoginAttempt({
                userId: "unknown",
                email: normalizedEmail,
                success: false,
                reason: "Too many login attempts — rate limit exceeded (5 attempts in 60 seconds)",
            });
            return NextResponse.json({
                error: "Too many login attempts. Please try again in a minute.",
                code: "RATE_LIMIT_EXCEEDED"
            }, { status: 429 });
        }
        const superAdmin = await prisma.superAdmin.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                },
            },
        });
        if (superAdmin) {
            const valid = await bcrypt.compare(password, superAdmin.password);
            if (!valid) {
                await logLoginAttempt({
                    userId: superAdmin.id,
                    email: normalizedEmail,
                    success: false,
                    reason: "Super admin password mismatch — incorrect password provided",
                });
                return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
            }
            const token = await createSession({
                userId: superAdmin.id,
                email: normalizedEmail,
                name: superAdmin.name || "",
                role: "SUPER_ADMIN",
                orgId: null,
            });
            // Log successful super admin login (console only, no Slack spam)
            await logLoginAttempt({
                userId: superAdmin.id,
                email: normalizedEmail,
                success: true,
            });
            const response = NextResponse.json({
                success: true,
                role: "SUPER_ADMIN",
                redirectTo: "/super-admin",
            });
            response.cookies.set("session", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 60 * 60 * 12, // 12 hours
                path: "/",
            });
            return response;
        }
        const userProfile = await prisma.organizationCredentials.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                },
            },
            include: { organization: { select: { isOnboardingComplete: true, orgStatus: true } } }
        });
        if (!userProfile || !userProfile.password) {
            // Spend the same time as a real password check so response timing
            // doesn't reveal whether the email is registered.
            await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
            await logLoginAttempt({
                userId: "unknown",
                email: normalizedEmail,
                success: false,
                reason: "User not found or password not set — email does not exist in system or account not initialized",
            });
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }
        // -- ORGANIZATION STATUS CHECKS -----------------------
        // We now allow login for all statuses to handle messaging in the dashboard
        const valid = await bcrypt.compare(password, userProfile.password);
        if (!valid) {
            await logLoginAttempt({
                userId: userProfile.id,
                email: normalizedEmail,
                success: false,
                reason: "Admin password mismatch — incorrect password provided",
            });
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }
        const token = await createSession({
            userId: userProfile.id,
            email: normalizedEmail,
            name: userProfile.name || "",
            role: "ADMIN",
            orgId: userProfile.organizationId || null,
            onboardingComplete: userProfile.organization?.isOnboardingComplete ?? false,
        });
        // Log successful admin login (console only, no Slack spam)
        await logLoginAttempt({
            userId: userProfile.id,
            email: normalizedEmail,
            success: true,
        });
        const response = NextResponse.json({
            success: true,
            role: "ADMIN",
            redirectTo: "/admin",
        });
        response.cookies.set("session", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 12, // 12 hours
            path: "/",
        });
        return response;
    } catch (error) {
        const email = request.headers.get("x-email") || "unknown";
        console.error("Login error:", error);
        await logLoginAttempt({
            userId: "unknown",
            email,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            reason: "Unexpected server error during login — exception thrown in auth handler",
        });
        return NextResponse.json({ error: "Login failed" }, { status: 500 });
    }
}
