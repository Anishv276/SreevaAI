import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, isAdminRole, isSuperAdminRole, refreshSessionCookie } from "@/lib/auth";

export async function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;

    const legacyLoginPaths = [
        "/admin/login",
        "/super-admin/login",
        "/hr-login",
        "/super-admin-login",
    ];
    if (legacyLoginPaths.some(p => pathname === p || pathname === `${p}/`)) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    // CRITICAL: Prepare path header for Server Components
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-pathname", pathname);

    // Public paths - no auth needed
    const publicPaths = ["/careers", "/org", "/api/auth", "/api/invitations", "/invite", "/interview", "/_next", "/favicon"];
    if (publicPaths.some(p => pathname.startsWith(p))) {
        const res = NextResponse.next({ request: { headers: requestHeaders } });
        return await refreshSessionCookie(req, res);
    }

    const session = await getSessionFromRequest(req);

    // Single login page for all roles
    if (pathname === "/login" || pathname === "/login/") {
        const res = NextResponse.next({ request: { headers: requestHeaders } });
        return await refreshSessionCookie(req, res);
    }

    // ── /super-admin → SUPER_ADMIN only ──────────────────────
    if (pathname.startsWith("/super-admin")) {
        if (!session) return NextResponse.redirect(new URL("/login?from=super-admin", req.url));
        if (!isSuperAdminRole(session.role)) {
            if (isAdminRole(session.role)) return NextResponse.redirect(new URL("/admin", req.url));
            return NextResponse.redirect(new URL("/login", req.url));
        }
        const res = NextResponse.next({ request: { headers: requestHeaders } });
        return await refreshSessionCookie(req, res);
    }

    // ── /admin → ADMIN only ───────────────────────────────
    if (pathname.startsWith("/admin")) {
        if (!session) return NextResponse.redirect(new URL("/login?from=admin", req.url));
        if (isSuperAdminRole(session.role)) return NextResponse.redirect(new URL("/super-admin", req.url));
        if (!isAdminRole(session.role)) return NextResponse.redirect(new URL("/login", req.url));

        // ── ONBOARDING PROTECTION ──────────────────────────
        const isSetupPage = pathname === "/admin/setup";
        const needsOnboarding = (session as any).onboardingComplete === false;

        if (needsOnboarding && !isSetupPage) {
            return NextResponse.redirect(new URL("/admin/setup", req.url));
        }
        if (!needsOnboarding && isSetupPage) {
            return NextResponse.redirect(new URL("/admin", req.url));
        }

        const res = NextResponse.next({ request: { headers: requestHeaders } });
        return await refreshSessionCookie(req, res);
    }

    // ── /api/super-admin → SUPER_ADMIN only ──────────────────
    if (pathname.startsWith("/api/super-admin")) {
        if (!session || !isSuperAdminRole(session.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const res = NextResponse.next({ request: { headers: requestHeaders } });
        return await refreshSessionCookie(req, res);
    }

    const res = NextResponse.next({ request: { headers: requestHeaders } });
    return await refreshSessionCookie(req, res);
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
