/**
 * app/api/demo/templates/route.ts
 * ─────────────────────────────────
 * GET  → list active DemoTemplates for the public /demo page
 * No auth required — public endpoint, only returns isActive = true templates
 * that are ready (status = "ready").
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/prisma-demo";
import { apiErrorResponse } from "@/lib/slack-error-logger";

export async function GET() {
    try {
        const templates = await db.demoTemplate.findMany({
            where: { isActive: true, status: "ready" },
            select: {
                id: true,
                title: true,
                roleTitle: true,
                mode: true,
            },
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({ templates });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/demo/templates",
            method: "GET",
            error,
            body: { error: "Failed to fetch templates" },
            status: 500,
            logLabel: "[DEMO/PUBLIC/TEMPLATES] error:",
        });
    }
}
