/**
 * app/api/super-admin/demo/sessions/route.ts
 * ────────────────────────────────────────────
 * GET  → list all DemoSessions (leads) — Super Admin view
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

        const sessions = await db.demoSession.findMany({
            orderBy: { startedAt: "desc" },
            include: {
                template: { select: { title: true, mode: true, isDeleted: true } },
            },
            take: 200,
        });
        const visible = sessions.map((s: any) => ({
            ...s,
            template: s.template && !s.template.isDeleted ? s.template : null,
        }));
        return NextResponse.json({ sessions: visible });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/super-admin/demo/sessions",
            method: "GET",
            error,
            body: { error: "Failed to fetch sessions" },
            status: 500,
            logLabel: "[DEMO/SESSIONS] GET error:",
        });
    }
}
