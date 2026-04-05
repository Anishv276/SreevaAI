import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || !session.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Verify member belongs to same org
        const member = await prisma.user.findUnique({
            where: { id }
        });

        if (!member || member.orgId !== session.orgId) {
            return NextResponse.json({ error: "Access Denied" }, { status: 403 });
        }

        // Prevent self-deletion if they are the only admin (optional logic but safe)
        if (member.id === session.userId) {
            return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
        }

        await prisma.user.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete team error:", error);
        return NextResponse.json({ error: "Removal failed" }, { status: 500 });
    }
}
