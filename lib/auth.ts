import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import redis from "./redis";
import { getSecretKey, allSecretKeys } from "./session-secret";

// ─── Rotating JWT Secret ───────────────────────────────────────────────────────
// The rotating-secret implementation now lives in lib/session-secret.ts so the
// Edge middleware (proxy.ts) and this Node auth layer verify against the SAME
// key set. See that module for the rotation/grace-period semantics.
// ──────────────────────────────────────────────────────────────────────────────

export type SessionRole = "SUPER_ADMIN" | "ADMIN" | "CANDIDATE";

export interface SessionUser {
    userId: string;
    email: string;
    name: string;
    role: SessionRole;
    orgId: string | null;
    onboardingComplete?: boolean;
}

type SessionTokenPayload = SessionUser & {
    exp?: number;
    iat?: number;
};

export function normalizeRole(role: string | null | undefined): SessionRole {
    const normalized = (role || "").toUpperCase();
    if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN";
    if (normalized === "ADMIN" || normalized === "ORG_ADMIN" || normalized === "HR" || normalized === "TEAM") return "ADMIN";
    return "CANDIDATE";
}

export function isSuperAdminRole(role: string | null | undefined): boolean {
    return normalizeRole(role) === "SUPER_ADMIN";
}

export function isAdminRole(role: string | null | undefined): boolean {
    return normalizeRole(role) === "ADMIN";
}

const SESSION_DURATION = "2h";
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function createSession(user: SessionUser): Promise<string> {
    return await new SignJWT({ ...user })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(SESSION_DURATION)
        .sign(getSecretKey());
}

// ─── Request-Level Session Cache ───────────────────────────────────────────────
// Prevents the same token from being verified more than once per request.
// This eliminates duplicate Redis + JWT calls that were causing 30s hangs.
// The cache is flushed every 5 seconds to prevent memory growth.
const _sessionCache = new Map<string, SessionUser | null>();
let _cacheFlushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleCacheFlush() {
    if (_cacheFlushTimer) return;
    _cacheFlushTimer = setTimeout(() => {
        _sessionCache.clear();
        _cacheFlushTimer = null;
    }, 5000);
}
// ───────────────────────────────────────────────────────────────────────────────

export async function verifySession(token: string): Promise<SessionUser | null> {
    // 1. Check in-memory cache first (zero network cost — eliminates duplicate trips)
    if (_sessionCache.has(token)) {
        return _sessionCache.get(token) ?? null;
    }

    try {
        // 2. Verify JWT — try current secret, then previous (handles rotation grace period)
        let payload: any = null;
        for (const key of allSecretKeys()) {
            try {
                const result = await jwtVerify(token, key);
                payload = result.payload;
                break;
            } catch {
                // try next key
            }
        }
        if (!payload) throw new Error("invalid token");
        const sessionUser = payload as unknown as SessionTokenPayload;

        // 3. REVOCATION CHECK — UNCONDITIONAL in every environment.
        //    Previously a NODE_ENV !== "production" fast-path skipped the blacklist
        //    and password-change checks entirely, so logout was a no-op outside
        //    prod (and in any prod that wasn't started with NODE_ENV=production).
        //    The latency optimization is the in-memory cache above + the single
        //    batched mget below — never the skipping of the security check.
        if (redis && sessionUser?.userId) {
            const [isBlacklisted, lastPwdChange] = await redis.mget(
                `blacklist:${token}`,
                `auth:pwd_change:${sessionUser.userId}`
            );

            if (isBlacklisted) {
                _sessionCache.set(token, null);
                scheduleCacheFlush();
                return null;
            }

            if (lastPwdChange && sessionUser.iat && sessionUser.iat * 1000 < Number(lastPwdChange)) {
                _sessionCache.set(token, null);
                scheduleCacheFlush();
                return null;
            }
        }

        const result = sessionUser as unknown as SessionUser;
        _sessionCache.set(token, result);
        scheduleCacheFlush();
        return result;
    } catch {
        _sessionCache.set(token, null);
        scheduleCacheFlush();
        return null;
    }
}

export async function invalidateUserSessions(userId: string) {
    if (redis) {
        await redis.set(`auth:pwd_change:${userId}`, Date.now().toString());
    }
}

export async function getSession(): Promise<SessionUser | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;
    return verifySession(token);
}

/**
 * Refreshes the session cookie for active users.
 * Handles the cookie refresh for the given request and attaches it to the response.
 */
export async function refreshSessionCookie(request: NextRequest, response: NextResponse) {
    const sessionCookie = request.cookies.get("session")?.value;
    if (!sessionCookie) return response;

    const parsed = await verifySession(sessionCookie);
    if (!parsed) return response;

    const tokenPayload = parsed as SessionTokenPayload;
    const expSeconds = Number(tokenPayload.exp || 0);
    if (expSeconds > 0) {
        const remainingMs = expSeconds * 1000 - Date.now();
        // Re-issue when less than 30 min left on the 2h token — sliding window
        if (remainingMs > 30 * 60 * 1000) {
            return response;
        }
    }

    const { exp, iat, ...userData } = tokenPayload;
    void exp;
    void iat;

    const newSessionToken = await createSession(userData);

    response.cookies.set("session", newSessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: new Date(Date.now() + SESSION_DURATION_MS),
        path: "/",
    });
    return response;
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
    const token = req.cookies.get("session")?.value;
    if (!token) return null;
    return verifySession(token);
}
