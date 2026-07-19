import { NextResponse } from "next/server";
import { db } from "@/lib/prisma-demo";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

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
        return apiErrorResponse({
            route: "/api/super-admin/demo/sessions/[id]",
            method: "DELETE",
            error,
            body: { error: "Failed to delete session" },
            status: 500,
            logLabel: "[DEMO/SESSIONS/DELETE] error:",
        });
    }
}
