import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashInviteToken } from "@/lib/invite";

type InviteRow = {
    id: string;
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

        const tokenHash = hashInviteToken(token);

        const rows = await prisma.$queryRawUnsafe<InviteRow[]>(
            `
            SELECT id, status, "expiresAt"
            FROM "OrgInvite"
            WHERE "tokenHash" = $1
            LIMIT 1
            `,
            tokenHash
        );

        const invite = rows?.[0];
        if (!invite) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });

        if (invite.status !== "PENDING") {
            return NextResponse.json({ error: "Invitation already handled" }, { status: 409 });
        }

        const expired = new Date(invite.expiresAt).getTime() <= Date.now();
        const nextStatus = expired ? "EXPIRED" : "REJECTED";

        await prisma.$executeRawUnsafe(
            `
            UPDATE "OrgInvite"
            SET status = $1, "respondedAt" = NOW(), "updatedAt" = NOW()
            WHERE id = $2::uuid
            `,
            nextStatus,
            invite.id
        );

        if (expired) {
            return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Reject invitation error:", error);
        return NextResponse.json({ error: "Failed to reject invitation" }, { status: 500 });
    }
}
