import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

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
        return payload as unknown as SessionUser;
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

export async function getSessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
    const token = req.cookies.get("session")?.value;
    if (!token) return null;
    return verifySession(token);
}
