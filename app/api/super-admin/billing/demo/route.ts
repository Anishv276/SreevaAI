import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdminRole } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

// Demo-interview billing, sourced from DemoTemplate.usageJson (JD extraction +
// brief generation, a one-time cost shared by every session of that template)
// and DemoSession.usageJson (live conversation, eval, and question-generation
// LLM calls + TTS/STT for that specific interview). Demo sessions have no
// OrganizationDetails row, so this never touches UsageEvent -- see
// prisma/schema.prisma's DemoTemplate/DemoSession usageJson columns and
// billing/billing.py's save_demo_session_usage.
//
// Returns the aggregate totals for the super-admin billing page's "Demo" card.
// Per-session rows are served separately by
// /api/super-admin/billing/demo/sessions (paginated).

function n(v: unknown): number {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
}

function llmCost(usage: Record<string, any>, path: string): number {
    const arr = Array.isArray(usage?.[path]?.llm) ? usage[path].llm : [];
    return arr.reduce((s: number, m: any) => s + n(m.costUsd), 0);
}

export async function GET() {
    try {
        const session = await getSession();
        if (!session || !isSuperAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [templates, sessions] = await Promise.all([
            prisma.demoTemplate.findMany({ where: { isDeleted: false }, select: { usageJson: true } }),
            prisma.demoSession.findMany({ where: { isDeleted: false }, select: { usageJson: true } }),
        ]);
        const templateCount = templates.length;
        const sessionCount = sessions.length;

        let jdExtractionCost = 0, briefCost = 0;
        for (const row of templates) {
            const usage = (row.usageJson && typeof row.usageJson === "object") ? (row.usageJson as Record<string, any>) : {};
            jdExtractionCost += llmCost(usage, "jdExtraction");
            briefCost += llmCost(usage, "brief");
        }

        let liveCost = 0, evalCost = 0, llmGenerationCost = 0, ttsCost = 0, sttCost = 0;
        for (const row of sessions) {
            const usage = (row.usageJson && typeof row.usageJson === "object") ? (row.usageJson as Record<string, any>) : {};
            liveCost += llmCost(usage, "live");
            evalCost += llmCost(usage, "eval");
            llmGenerationCost += llmCost(usage, "llmGeneration");
            ttsCost += n(usage.tts?.costUsd);
            sttCost += n(usage.stt?.costUsd);
        }

        const totalCost = jdExtractionCost + briefCost + liveCost + evalCost + llmGenerationCost + ttsCost + sttCost;

        return NextResponse.json({
            templateCount,
            sessionCount,
            totals: {
                jdExtractionCost, briefCost, liveCost, evalCost, llmGenerationCost, ttsCost, sttCost, totalCost,
            },
        });
    } catch (e) {
        return apiErrorResponse({
            route: "/api/super-admin/billing/demo",
            method: "GET",
            error: e,
            body: { error: "Failed" },
            status: 500,
            logLabel: "[DEMO_BILLING]",
        });
    }
}
