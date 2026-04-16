import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashInviteToken } from "@/lib/invite";

export async function POST(
    request: Request,
    context: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await context.params;
        if (!token) return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });

        const tokenHash = hashInviteToken(token);

        // ── Wrap SELECT + UPDATE in a transaction ────────────────────────────────
        // Without a transaction the two operations are non-atomic: a concurrent
        // accept or second reject request can slip between the SELECT and UPDATE,
        // leaving the invite in an inconsistent state (e.g. accepted but then
        // overwritten as REJECTED).  FOR UPDATE takes a row-level lock so only one
        // concurrent writer can proceed at a time.
        const result = await prisma.$transaction(async (tx) => {
            type InviteRow = { id: string; status: string; expiresAt: string };

            const rows = await tx.$queryRawUnsafe<InviteRow[]>(
                `
                SELECT id, status, "expiresAt"
                FROM "OrgInvite"
                WHERE "tokenHash" = $1
                LIMIT 1
                FOR UPDATE
                `,
                tokenHash
            );

            const invite = rows?.[0];
            if (!invite) return { notFound: true } as const;

            if (invite.status !== "PENDING") {
                return { alreadyHandled: true } as const;
            }

            const expired = new Date(invite.expiresAt).getTime() <= Date.now();
            const nextStatus = expired ? "EXPIRED" : "REJECTED";

            await tx.$executeRawUnsafe(
                `
                UPDATE "OrgInvite"
                SET status = $1, "respondedAt" = NOW(), "updatedAt" = NOW()
                WHERE id = $2::uuid
                `,
                nextStatus,
                invite.id
            );

            return { expired } as const;
        });

        if ("notFound" in result) {
            return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
        }
        if ("alreadyHandled" in result) {
            return NextResponse.json({ error: "Invitation already handled" }, { status: 409 });
        }
        if (result.expired) {
            return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Reject invitation error:", error);
        return NextResponse.json({ error: "Failed to reject invitation" }, { status: 500 });
    }
}
