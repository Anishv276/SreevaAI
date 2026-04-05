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
        if (!token) return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });

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
        if (!invite) {
            return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
        }

        const expired = new Date(invite.expiresAt).getTime() <= Date.now();

        if (invite.status === "PENDING" && expired) {
            await prisma.$executeRawUnsafe(
                `
                UPDATE "OrgInvite"
                SET status = 'EXPIRED', "updatedAt" = NOW()
                WHERE id = $1::uuid
                `,
                invite.id
            );
            return NextResponse.json({ error: "Invitation expired", status: "EXPIRED" }, { status: 410 });
        }

        if (invite.status !== "PENDING") {
            return NextResponse.json(
                { error: `Invitation is ${invite.status.toLowerCase()}`, status: invite.status },
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
