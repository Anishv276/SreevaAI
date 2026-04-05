import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "lumoscale-super-secret-jwt-key-2026"
);

export type SessionRole = "SUPER_ADMIN" | "ADMIN" | "CANDIDATE";

export interface SessionUser {
    userId: string;
    email: string;
    name: string;
    role: SessionRole;
    orgId: string | null;
}

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
        .sign(SECRET);
}

export async function verifySession(token: string): Promise<SessionUser | null> {
    try {
        const { payload } = await jwtVerify(token, SECRET);
        return payload as unknown as any;
    } catch {
        return null;
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

    // Remove existing timestamps to prevent conflicts when re-signing
    const { exp, iat, ...userData } = parsed as any;
    
    const expiresIn = 7 * 24 * 60 * 60 * 1000; // 7 days
    const newSessionToken = await createSession(userData as any);
    
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
