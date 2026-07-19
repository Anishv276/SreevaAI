/**
 * app/api/super-admin/demo/templates/route.ts
 * ────────────────────────────────────────────
 * GET  → list all DemoTemplates (Super Admin page)
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/prisma-demo";
import { getSession } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const templates = await db.demoTemplate.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                _count: { select: { sessions: true } },
            },
        });
        return NextResponse.json({ templates });
    } catch (error) {
        console.error("[DEMO/TEMPLATES] GET error:", error);
        return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
    }
}

