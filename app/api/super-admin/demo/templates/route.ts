/**
 * app/api/super-admin/demo/templates/route.ts
 * ────────────────────────────────────────────
 * GET  → list all DemoTemplates (Super Admin page)
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/prisma-demo";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

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
        return apiErrorResponse({
            route: "/api/super-admin/demo/templates",
            method: "GET",
            error,
            body: { error: "Failed to fetch templates" },
            status: 500,
            logLabel: "[DEMO/TEMPLATES] GET error:",
        });
    }
}

