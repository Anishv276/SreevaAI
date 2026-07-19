import { NextRequest, NextResponse } from "next/server";
import { getSession, refreshSessionCookie } from "@/lib/auth";
import { isRateLimited } from "@/lib/rate-limit";

// Routes that authenticate themselves and must stay reachable without a session cookie:
//  - auth flows for logged-out users (login, signup, password reset, OTP verify)
//  - candidate-facing flows that authenticate via a one-time invite/interview token
//    instead of a session (see lib/interview-access.ts -- fails closed by default)
//  - webhooks that authenticate via signature/secret header, not a session
//  - the /api/test/* sandbox, which has its own key/SUPER_ADMIN check (lib/test-key.ts)
//  - health checks
const PUBLIC_PREFIXES = [
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/verify-otp",
    "/api/health",
    "/api/log-client-error",
    "/api/schedule/",
    "/api/interview/",
    "/api/demo/",
    "/api/upload/interview-snapshot",
    "/api/internal/",
    "/api/webhooks/",
    "/api/test/",
];

function isPublic(pathname: string): boolean {
    return PUBLIC_PREFIXES.some((prefix) =>
        prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix
    );
}

// Generous ceiling against a runaway client/script or a compromised session
// hammering the API -- not meant to constrain normal interactive admin usage.
const AUTHED_RATE_LIMIT = 300;
const AUTHED_RATE_WINDOW_S = 60;

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (!pathname.startsWith("/api/") || isPublic(pathname)) {
        return NextResponse.next();
    }

    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }

    const limited = await isRateLimited(`api:${session.userId}`, AUTHED_RATE_LIMIT, AUTHED_RATE_WINDOW_S);
    if (limited) {
        return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
    }

    return refreshSessionCookie(request, NextResponse.next());
}

// Proxy always runs on the Node.js runtime (unlike the old Middleware
// convention, which defaulted to Edge) -- no runtime override needed here.
// getSession() -> lib/redis.ts uses ioredis (raw TCP), which only Node.js supports.
export const config = {
    matcher: ["/api/:path*"],
};
