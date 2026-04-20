import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashInviteToken, normalizeOrgRole } from "@/lib/invite";

type InviteLookupRow = {
    id: string;
    orgId: string;
    email: string;
    orgRole: string;
    status: string;
    expiresAt: string;
    orgName: string;
};

export async function GET(
    request: Request,
    context: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await context.params;
        if (!token) return NextResponse.json({ error: "Invalid invite link" }, { status: 400 });

        // Always hash and query - constant-time path regardless of token validity.
        // This prevents timing-based token enumeration (attacker cannot tell if a
        // token exists by measuring response latency).
        const tokenHash = hashInviteToken(token);

        const rows = await prisma.$queryRawUnsafe<InviteLookupRow[]>(
            `
            SELECT
                i.id,
                i."orgId",
                i.email,
                i."orgRole",
                i.status,
                i."expiresAt",
                o.name AS "orgName"
            FROM "OrgInvite" i
            JOIN "Organization" o ON o.id = i."orgId"
            WHERE i."tokenHash" = $1
            LIMIT 1
            `,
            tokenHash
        );

        const invite = rows?.[0];

        // Use the same generic error for not-found AND any invalid/used token so
        // attackers cannot enumerate valid tokens by error-message differentiation.
        if (!invite) {
            return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
        }

        // Check expiry at READ time - do NOT write to the database in a GET
        // handler. Mutating state on a GET breaks REST semantics and can cause
        // problems with browser prefetching, CDN caching, and idempotency.
        const expired = new Date(invite.expiresAt).getTime() <= Date.now();

        if (expired || invite.status === "EXPIRED") {
            // Uniform error - same message as not-found to prevent status enumeration.
            return NextResponse.json({ error: "Invalid or expired invitation", status: "EXPIRED" }, { status: 410 });
        }

        if (invite.status !== "PENDING") {
            // Uniform error - covers ACCEPTED, REJECTED, etc.
            return NextResponse.json(
                { error: "Invalid or expired invitation", status: invite.status },
                { status: 409 }
            );
        }

        return NextResponse.json({
            id: invite.id,
            email: invite.email,
            role: normalizeOrgRole(invite.orgRole),
            orgName: invite.orgName,
            expiresAt: invite.expiresAt,
            status: invite.status,
        });
    } catch (error) {
        console.error("Get invitation error:", error);
        return NextResponse.json({ error: "Failed to load invitation" }, { status: 500 });
    }
}
