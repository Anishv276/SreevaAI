/**
 * app/api/super-admin/demo/sessions/route.ts
 * ────────────────────────────────────────────
 * GET  → list all DemoSessions (leads) — Super Admin view
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
        console.error("[DEMO/SESSIONS] GET error:", error);
        return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
    }
}
