import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { normalizeRole } from "@/lib/auth";
import { hashInviteToken, normalizeOrgRole } from "@/lib/invite";
import { generateId } from "@/lib/ids";
import { validatePasswordStrength } from "@/lib/validation";

type InviteRow = {
    id: string;
    orgId: string;
    email: string;
    orgRole: string;
    status: string;
    expiresAt: string;
};

export async function POST(
    request: Request,
    context: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await context.params;
        if (!token) return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });

        const { name, password } = await request.json();
        const normalizedName = String(name || "").trim();
        const normalizedPassword = String(password || "").trim();

        if (!normalizedName) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        const { isValid: isPasswordValid, error: passwordError } = validatePasswordStrength(normalizedPassword);
        if (!isPasswordValid) {
            return NextResponse.json({ error: passwordError }, { status: 400 });
        }

        const tokenHash = hashInviteToken(token);
        const hashedPassword = await bcrypt.hash(normalizedPassword, 10);

        const accepted = await prisma.$transaction(async (tx) => {
            // ── TOCTOU / Pessimistic lock ────────────────────────────────────────────
            // All reads AND writes happen inside a single serializable transaction so
            // two concurrent requests cannot both pass the PENDING check and both
            // create/update a user.  The final UPDATE with WHERE status='PENDING'
            // acts as an atomic guard — only one winner gets updated > 0 rows.
            const inviteRows = await tx.$queryRawUnsafe<InviteRow[]>(
                `
                SELECT id, "orgId", email, "orgRole", status, "expiresAt"
                FROM "OrgInvite"
                WHERE "tokenHash" = $1
                LIMIT 1
                FOR UPDATE
                `,
                tokenHash
            );

            const invite = inviteRows?.[0];
            if (!invite) throw new Error("INVITE_NOT_FOUND");

            if (invite.status !== "PENDING") throw new Error(`INVITE_${invite.status}`);

            if (new Date(invite.expiresAt).getTime() <= Date.now()) {
                await tx.$executeRawUnsafe(
                    `
                    UPDATE "OrgInvite"
                    SET status = 'EXPIRED', "updatedAt" = NOW()
                    WHERE id = $1
                    `,
                    invite.id
                );
                throw new Error("INVITE_EXPIRED");
            }

            // ── Inconsistent authorization / org-hopping guard ───────────────────────
            // If a user with this email already exists in a DIFFERENT org, we must
            // reject the accept — we cannot reassign them without their consent and
            // without revoking their previous org membership.  If they already belong
            // to THIS org we allow the update (e.g. re-invitation with a role change).
            const existingUser = await tx.user.findUnique({ where: { email: invite.email } });
            if (existingUser?.orgId && existingUser.orgId !== invite.orgId) {
                throw new Error("USER_OTHER_ORG");
            }

            // ── Session role: use invite's orgRole, NOT a hardcoded "ADMIN" ──────────
            // The invite carries the intended role (ADMIN, HR, TEAM).  Map it to the
            // internal normalizeOrgRole canonical form, then to the session role.
            const assignedOrgRole = normalizeOrgRole(invite.orgRole);

            const baseData = {
                name: normalizedName,
                password: hashedPassword,
                // `role` is the session-facing role — derive from the invite's orgRole.
                // Previously this was hardcoded to "ADMIN" which gave all invited users
                // full admin access regardless of their intended permission level.
                role: normalizeRole(assignedOrgRole) as string,
                orgId: invite.orgId,
            };

            const user = existingUser
                ? await tx.user.update({ where: { id: existingUser.id }, data: baseData })
                : await tx.user.create({
                    data: {
                        id: generateId("usr", normalizedName || invite.email.split("@")[0]),
                        email: invite.email,
                        ...baseData,
                    },
                });

            await tx.$executeRawUnsafe(
                `
                UPDATE "User"
                SET "orgRole" = $1, "updatedAt" = NOW()
                WHERE id = $2
                `,
                assignedOrgRole,
                user.id
            );

            const updated = await tx.$executeRawUnsafe(
                `
                UPDATE "OrgInvite"
                SET status = 'ACCEPTED', "respondedAt" = NOW(), "acceptedAt" = NOW(), "acceptedUserId" = $1, "updatedAt" = NOW()
                WHERE id = $2::uuid AND status = 'PENDING'
                `,
                user.id,
                invite.id
            );

            if (!updated) throw new Error("INVITE_ALREADY_PROCESSED");

            return {
                id: user.id,
                email: user.email,
                name: user.name || normalizedName,
                orgId: user.orgId,
                // Return the resolved role so we can set it correctly in the session.
                sessionRole: normalizeRole(assignedOrgRole),
            };
        });

        // ── Session creation: use the invite's role, not a hardcoded "ADMIN" ────────
        const tokenValue = await createSession({
            userId: accepted.id,
            email: accepted.email,
            name: accepted.name,
            role: accepted.sessionRole,
            orgId: accepted.orgId || null,
        });

        const response = NextResponse.json({ success: true, redirectTo: "/admin" });
        response.cookies.set("session", tokenValue, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 7,
            path: "/",
        });

        return response;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "UNKNOWN";

        if (message === "INVITE_NOT_FOUND") {
            return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
        }

        if (message === "INVITE_EXPIRED") {
            return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
        }

        if (message.startsWith("INVITE_") || message === "INVITE_ALREADY_PROCESSED") {
            return NextResponse.json({ error: "Invitation already handled" }, { status: 409 });
        }

        if (message === "USER_OTHER_ORG") {
            return NextResponse.json({ error: "This email already belongs to another organization" }, { status: 409 });
        }

        console.error("Accept invitation error:", error);
        return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
    }
}
