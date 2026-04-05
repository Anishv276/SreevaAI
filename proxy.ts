import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, isAdminRole, isSuperAdminRole } from "@/lib/auth";

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

    // Public paths - no auth needed
    const publicPaths = ["/careers", "/org", "/api/auth", "/interview", "/_next", "/favicon"];
    if (publicPaths.some(p => pathname.startsWith(p))) return NextResponse.next();

    const session = await getSessionFromRequest(req);

    // Single login page for all roles - Allow access even if session exists to enable account switching/UI viewing
    if (pathname === "/login" || pathname === "/login/") {
        return NextResponse.next();
    }

    // ── /super-admin → SUPER_ADMIN only ──────────────────────
    if (pathname.startsWith("/super-admin")) {
        if (!session) return NextResponse.redirect(new URL("/login?from=super-admin", req.url));
        if (!isSuperAdminRole(session.role)) {
            if (isAdminRole(session.role)) return NextResponse.redirect(new URL("/admin", req.url));
            return NextResponse.redirect(new URL("/login", req.url));
        }
        return NextResponse.next();
    }

    // ── /admin → ADMIN only ───────────────────────────────
    if (pathname.startsWith("/admin")) {
        if (!session) return NextResponse.redirect(new URL("/login?from=admin", req.url));
        if (isSuperAdminRole(session.role)) return NextResponse.redirect(new URL("/super-admin", req.url));
        if (!isAdminRole(session.role)) return NextResponse.redirect(new URL("/login", req.url));
        return NextResponse.next();
    }

    // ── /api/super-admin → SUPER_ADMIN only ──────────────────
    if (pathname.startsWith("/api/super-admin")) {
        if (!session || !isSuperAdminRole(session.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.next();
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
