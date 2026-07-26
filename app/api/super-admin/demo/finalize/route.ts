/**
 * app/api/super-admin/demo/finalize/route.ts
 * ─────────────────────────────────────────────
 * POST → Save the final (user-edited) questions and mark the template ready.
 * This is Step 4 of the wizard.
 *
 * Body: { templateId, questions: BankQuestion[] }
 * Returns: { success: true }
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/prisma-demo";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const body = await request.json();
        const { templateId, questions } = body;

        if (!templateId || !Array.isArray(questions) || questions.length === 0) {
            return NextResponse.json({ error: "Missing templateId or questions" }, { status: 400 });
        }

        const template = await db.demoTemplate.findUnique({ where: { id: templateId } });
        if (!template) {
            return NextResponse.json({ error: "Template not found" }, { status: 404 });
        }

        const questionBankSnapshot = {
            ...(typeof template.questionBankSnapshot === "object" && template.questionBankSnapshot !== null
                ? template.questionBankSnapshot
                : {}),
            questions,
            finalizedAt: new Date().toISOString(),
        };

        await db.demoTemplate.update({
            where: { id: templateId },
            data: {
                questionBankSnapshot,
                status: "ready",
                isActive: true,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/super-admin/demo/finalize",
            method: "POST",
            error,
            body: { error: "Failed to finalize demo template" },
            status: 500,
            logLabel: "[DEMO/FINALIZE] error:",
        });
    }
}
