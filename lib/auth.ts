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
    if (normalized === "ADMIN" || normalized === "ORG_ADMIN" || normalized === "HR") return "ADMIN";
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

export async function verifySession(token: string): Promise<SessionUser | null> {
    try {
        if (redis) {
            const isBlacklisted = await redis.get(`blacklist:${token}`);
            if (isBlacklisted) return null;
        }
        const { payload } = await jwtVerify(token, getSecretKey());
        const sessionUser = payload as unknown as any;

        if (redis && sessionUser?.userId) {
            const lastPwdChange = await redis.get(`auth:pwd_change:${sessionUser.userId}`);
            if (lastPwdChange && sessionUser.iat && sessionUser.iat * 1000 < Number(lastPwdChange)) {
                return null;
            }
        }

        return sessionUser as unknown as SessionUser;
    } catch {
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

    // Refresh the session token
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

    // Remove existing timestamps to prevent conflicts when re-signing
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
