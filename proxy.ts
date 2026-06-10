import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { stableSeedKey } from "./lib/session-secret";

type SessionRole = "SUPER_ADMIN" | "ADMIN" | "CANDIDATE";

interface SessionUser {
    userId: string;
    email: string;
    name: string;
    role: SessionRole;
    orgId: string | null;
    onboardingComplete?: boolean;
}

function normalizeRole(role: string | null | undefined): SessionRole {
    const n = (role || "").toUpperCase();
    if (n === "SUPER_ADMIN") return "SUPER_ADMIN";
    if (n === "ADMIN" || n === "ORG_ADMIN" || n === "HR" || n === "TEAM") return "ADMIN";
    return "CANDIDATE";
}

function isSuperAdminRole(role: string | null | undefined) {
    return normalizeRole(role) === "SUPER_ADMIN";
}

function isAdminRole(role: string | null | undefined) {
    return normalizeRole(role) === "ADMIN";
}

async function getSessionFromRequest(req: NextRequest): Promise<{ user: SessionUser; payload: any } | null> {
    const token = req.cookies.get("session")?.value;
    if (!token) return null;
    // The Edge middleware verifies against the stable env-seeded key only (no
    // rotation) to avoid drift between the Edge and Node isolates. Authoritative
    // revocation (logout blacklist, password-change) runs in the Node API layer
    // via verifySession(); this middleware is a first-layer page gate.
    try {
        const { payload } = await jwtVerify(token, stableSeedKey());
        return { user: payload as unknown as SessionUser, payload };
    } catch {
        return null;
    }
}

export async function proxy(req: NextRequest) {
    const host = req.headers.get('host');

    if (req.nextUrl.pathname === "/") {
        return NextResponse.rewrite(new URL("/index.html", req.url));
    }

    if (host && (host === 'sreevaai.com' || host.startsWith('sreevaai.com:'))) {
        const url = req.nextUrl.clone();
        url.hostname = 'www.sreevaai.com';
        url.port = '';
        return NextResponse.redirect(url, 301);
    }

    const { pathname } = req.nextUrl;

    const legacyLoginPaths = ["/admin/login", "/super-admin/login", "/hr-login", "/super-admin-login"];
    if (legacyLoginPaths.some(p => pathname === p || pathname === `${p}/`)) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-pathname", pathname);

    // NOTE: the session cookie's sliding refresh (re-issuing a fresh 2h token) is
    // owned by the Node API layer (lib/auth.ts refreshSessionCookie), which has
    // access to the rotating secret and the Redis blacklist. The Edge middleware
    // only verifies and gates — it never re-signs tokens, avoiding cross-isolate
    // secret drift.
    const publicPaths = ["/careers", "/org", "/api/auth", "/api/invitations", "/api/stream", "/invite", "/interview", "/_next", "/favicon"];
    if (publicPaths.some(p => pathname.startsWith(p))) {
        return NextResponse.next({ request: { headers: requestHeaders } });
    }

    if (pathname === "/login" || pathname === "/login/") {
        return NextResponse.next({ request: { headers: requestHeaders } });
    }

    const sessionResult = await getSessionFromRequest(req);

    if (pathname.startsWith("/super-admin")) {
        if (!sessionResult) return NextResponse.redirect(new URL("/login?from=super-admin", req.url));
        if (!isSuperAdminRole(sessionResult.user.role)) {
            if (isAdminRole(sessionResult.user.role)) return NextResponse.redirect(new URL("/admin", req.url));
            return NextResponse.redirect(new URL("/login", req.url));
        }
        return NextResponse.next({ request: { headers: requestHeaders } });
    }

    if (pathname.startsWith("/admin")) {
        if (!sessionResult) return NextResponse.redirect(new URL("/login?from=admin", req.url));
        if (isSuperAdminRole(sessionResult.user.role)) return NextResponse.redirect(new URL("/super-admin", req.url));
        if (!isAdminRole(sessionResult.user.role)) return NextResponse.redirect(new URL("/login", req.url));

        const isSetupPage = pathname === "/admin/setup";
        const needsOnboarding = (sessionResult.user as any).onboardingComplete === false;
        if (needsOnboarding && !isSetupPage) return NextResponse.redirect(new URL("/admin/setup", req.url));
        if (!needsOnboarding && isSetupPage) return NextResponse.redirect(new URL("/admin", req.url));

        return NextResponse.next({ request: { headers: requestHeaders } });
    }

    if (pathname.startsWith("/api/super-admin")) {
        if (!sessionResult || !isSuperAdminRole(sessionResult.user.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.next({ request: { headers: requestHeaders } });
    }

    return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon\\.ico|api/extract|api/admin/create-drive/upload-jd-pdf).*)",
    ],
};