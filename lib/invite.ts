import crypto from "crypto";

export type OrgTeamRole = "ADMIN" | "HR" | "TEAM";

export function normalizeOrgRole(role: string | null | undefined): OrgTeamRole {
    const normalized = (role || "").toUpperCase();
    if (normalized === "ADMIN") return "ADMIN";
    if (normalized === "HR") return "HR";
    if (normalized === "RECRUITER" || normalized === "TEAM") return "TEAM";
    return "TEAM";
}

export function hashInviteToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken(): { rawToken: string; tokenHash: string } {
    const rawToken = `${crypto.randomUUID()}-${crypto.randomBytes(24).toString("hex")}`;
    return {
        rawToken,
        tokenHash: hashInviteToken(rawToken),
    };
}

export function getInviteExpiry(hours = 72): Date {
    return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function getAppBaseUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL || "https://sreevaai.com";
}

export function buildInviteUrl(rawToken: string): string {
    return `${getAppBaseUrl()}/invite/${encodeURIComponent(rawToken)}`;
}
