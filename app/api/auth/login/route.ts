import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createSession, normalizeRole } from "@/lib/auth";
import { isRateLimited } from "@/lib/ratelimit";

type SuperAdminDelegate = {
    findUnique: (args: { where: { email: string } }) => Promise<{
        id: string;
        email: string;
        password: string;
        name: string;
    } | null>;
};

export async function POST(request: Request) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // ── RATE LIMITING ───────────────────────────────────
        const isLimited = await isRateLimited(`login:${normalizedEmail}`, 5, 60);
        if (isLimited) {
            return NextResponse.json({ 
                error: "Too many login attempts. Please try again in a minute.", 
                code: "RATE_LIMIT_EXCEEDED" 
            }, { status: 429 });
        }

        const prismaWithSuperAdmin = prisma as unknown as { superAdmin?: SuperAdminDelegate };
        const superAdmin = prismaWithSuperAdmin.superAdmin
            ? await prismaWithSuperAdmin.superAdmin.findUnique({ where: { email: normalizedEmail } })
            : null;

        if (superAdmin) {
            const valid = await bcrypt.compare(password, superAdmin.password);
            if (!valid) {
                return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
            }

            const token = await createSession({
                userId: superAdmin.id,
                email: superAdmin.email,
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
                maxAge: 60 * 60 * 24 * 7,
                path: "/",
            });

            return response;
        }

        const userProfile = (await prisma.user.findUnique({ 
            where: { email: normalizedEmail },
            include: { organization: { select: { onboardingComplete: true, status: true } } }
        } as any)) as any;

        if (!userProfile || !userProfile.password) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        // ── ORGANIZATION STATUS CHECKS ───────────────────────
        if (userProfile.organization) {
            const org = userProfile.organization;
            if (org.status === "SUSPENDED") {
                return NextResponse.json({ 
                    error: "Please recharge credits for service to continue",
                    code: "ORG_SUSPENDED"
                }, { status: 403 });
            }
            if (org.status === "CLOSED") {
                return NextResponse.json({ 
                    error: "Your login has been closed, please contact administrator to this",
                    code: "ORG_CLOSED"
                }, { status: 403 });
            }
        }

        const valid = await bcrypt.compare(password, userProfile.password);
        if (!valid) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        const role = normalizeRole(userProfile.role);

        const token = await createSession({
            userId: userProfile.id,
            email: userProfile.email,
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
            maxAge: 60 * 60 * 24 * 7, // 7 days
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("Login error:", error);
        return NextResponse.json({ error: "Login failed" }, { status: 500 });
    }
}
