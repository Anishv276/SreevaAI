import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createSession, normalizeRole } from "@/lib/auth";
import { isRateLimited } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/email";

// A pre-computed bcrypt hash of a random string. We compare against this when no
// user is found so the request spends the same time as a real bcrypt check —
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
                return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
            }

            const token = await createSession({
                userId: superAdmin.id,
                email: normalizedEmail,
                name: superAdmin.name || "",
                role: "SUPER_ADMIN",
                orgId: null,
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
                maxAge: 60 * 60 * 2, // 2 hours (sliding — proxy refreshes on activity)
                path: "/",
            });

            return response;
        }

        const userProfile = (await prisma.user.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                },
            },
            include: { organization: { select: { onboardingComplete: true, status: true } } }
        } as any)) as any;

        if (!userProfile || !userProfile.password) {
            // Spend the same time as a real password check so response timing
            // doesn't reveal whether the email is registered.
            await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        // -- ORGANIZATION STATUS CHECKS -----------------------
        // We now allow login for all statuses to handle messaging in the dashboard


        const valid = await bcrypt.compare(password, userProfile.password);
        if (!valid) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        const role = normalizeRole(userProfile.role);

        const token = await createSession({
            userId: userProfile.id,
            email: normalizedEmail,
            name: userProfile.name || "",
            role,
            orgId: userProfile.orgId || null,
            onboardingComplete: userProfile.organization?.onboardingComplete ?? false,
        });

        const response = NextResponse.json({
            success: true,
            role,
            redirectTo: role === "SUPER_ADMIN" ? "/super-admin" : role === "ADMIN" ? "/admin" : "/careers",
        });

        response.cookies.set("session", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 2, // 2 hours (sliding — proxy refreshes on activity) // 7 days
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("Login error:", error);
        return NextResponse.json({ error: "Login failed" }, { status: 500 });
    }
}
