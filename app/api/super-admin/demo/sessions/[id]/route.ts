import { NextResponse } from "next/server";
import { db } from "@/lib/prisma-demo";
import { getSession } from "@/lib/auth";

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }
        const { id } = await params;
        
        await db.demoSession.update({
            where: { id },
            data: { isDeleted: true },
        });
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[DEMO/SESSIONS/DELETE] error:", error);
        return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
    }
}
