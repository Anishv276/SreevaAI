/**
 * app/api/super-admin/demo/create/route.ts
 * ─────────────────────────────────────────
 * POST → Create a DemoTemplate row with just a title (Step 1 of the wizard).
 * JD upload, extraction, question generation, and settings are handled
 * by subsequent wizard steps via dedicated routes.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/prisma-demo";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const body = await request.json();
        const title = (body.title as string | null)?.trim();

        if (!title) {
            return NextResponse.json({ error: "Missing required field: title" }, { status: 400 });
        }

        const template = await db.demoTemplate.create({
            data: {
                title,
                roleTitle: title,
                mode: "TECH", // default, will be updated in Step 3
                status: "processing",
                isActive: false,
            },
        });

        return NextResponse.json({ templateId: template.id });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/super-admin/demo/create",
            method: "POST",
            error,
            body: { error: "Failed to create demo template" },
            status: 500,
            logLabel: "[DEMO/CREATE] error:",
        });
    }
}
