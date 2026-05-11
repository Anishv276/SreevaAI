import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import redis from "./redis";

function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET?.trim();
    if (secret) return secret;

    if (process.env.NODE_ENV === "production") {
        throw new Error(
            "JWT_SECRET is required in production environments. Please set it in your environment."
        );
    }
    return "development-jwt-fallback-secret-keep-secure";
}

function getSecretKey() {
    return new TextEncoder().encode(getJwtSecret());
}

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

export async function createSession(user: SessionUser): Promise<string> {
    return await new SignJWT({ ...user })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
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
        // 2. Verify JWT cryptographically first (no network needed)
        const { payload } = await jwtVerify(token, getSecretKey());
        const sessionUser = payload as unknown as SessionTokenPayload;

        // 3. DEV MODE FAST PATH: Skip cloud Redis entirely to avoid 200-500ms latency
        //    This is the primary fix for the 30-second local dev hang.
        if (process.env.NODE_ENV !== "production") {
            const result = sessionUser as unknown as SessionUser;
            _sessionCache.set(token, result);
            scheduleCacheFlush();
            return result;
        }

        // 4. PRODUCTION: Batch BOTH Redis checks into ONE single round-trip (was 2 separate trips)
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
        const refreshThresholdMs = 24 * 60 * 60 * 1000; // refresh only in last 24h
        if (remainingMs > refreshThresholdMs) {
            return response;
        }
    }

    const { exp, iat, ...userData } = tokenPayload;
    void exp;
    void iat;

    const expiresIn = 7 * 24 * 60 * 60 * 1000; // 7 days
    const newSessionToken = await createSession(userData);

    response.cookies.set("session", newSessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: new Date(Date.now() + expiresIn),
        path: "/",
    });
    return response;
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
    const token = req.cookies.get("session")?.value;
    if (!token) return null;
    return verifySession(token);
}
