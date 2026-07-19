/**
 * app/api/super-admin/demo/templates/[id]/route.ts
 * ─────────────────────────────────────────────────
 * PATCH → toggle isActive on a DemoTemplate
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/prisma-demo";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }
        const { id } = await params;
        const body = await request.json();
        const updated = await db.demoTemplate.update({
            where: { id },
            data: { isActive: Boolean(body.isActive) },
        });
        return NextResponse.json({ template: updated });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/super-admin/demo/templates/[id]",
            method: "PATCH",
            error,
            body: { error: "Failed to update template" },
            status: 500,
            logLabel: "[DEMO/TEMPLATES/PATCH] error:",
        });
    }
}

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
        
        await db.demoTemplate.update({
            where: { id },
            data: { isDeleted: true },
        });
        
        return NextResponse.json({ success: true });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/super-admin/demo/templates/[id]",
            method: "DELETE",
            error,
            body: { error: "Failed to delete template" },
            status: 500,
            logLabel: "[DEMO/TEMPLATES/DELETE] error:",
        });
    }
}
