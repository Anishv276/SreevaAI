import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole } from "@/lib/auth";

export async function DELETE(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || !session.orgId || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await context.params;

        // Perform physical deletion from the "OrgInvite" table
        // We still filter by orgId to ensure privacy and security
        const deleted = await prisma.orgInvite.deleteMany({
            where: {
                id: id,
                orgId: session.orgId
            }
        });

        if (deleted.count === 0) {
            return NextResponse.json({ error: "Invite not found or already deleted" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete invite error:", error);
        return NextResponse.json({ error: "Failed to delete invite" }, { status: 500 });
    }
}
