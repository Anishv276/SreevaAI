import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdminRole } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

// Demo-interview billing, sourced from DemoTemplate.usageJson (JD extraction,
// a one-time cost shared by every session of that template)
// and DemoSession.usageJson (eval and question-generation LLM calls + TTS/STT
// for that specific interview -- every live-agent turn is directive-driven, so
// its usage is already captured per-turn under eval/llmGeneration; there is no
// separate "live" bucket, see agent_runtime.py's demo completion branch).
// Demo sessions have no OrganizationDetails row, so this never touches
// UsageEvent -- see prisma/schema.prisma's DemoTemplate/DemoSession usageJson
// columns and billing/billing.py's save_demo_session_usage.
//
// Returns the aggregate totals for the super-admin billing page's "Demo" card.
// sessionCount only counts COMPLETED sessions (the only ones billing.py ever
// writes usageJson for) so it reflects actual demo interviews, not abandoned
// LAUNCHING/IN_PROGRESS/FAILED attempts. Per-session rows are served
// separately by /api/super-admin/billing/demo/sessions (paginated, all
// statuses).

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
            // Only sessions that actually ran to completion get usageJson written
            // (billing.py's save_demo_session_usage runs once, at session end) --
            // LAUNCHING/IN_PROGRESS/FAILED attempts never bill anything, so counting
            // them here would inflate "N sessions" above the number of demo
            // interviews that actually happened.
            prisma.demoSession.findMany({ where: { isDeleted: false, status: "COMPLETED" }, select: { usageJson: true } }),
        ]);
        const templateCount = templates.length;
        const sessionCount = sessions.length;

        let jdExtractionCost = 0, questionBankCost = 0;
        for (const row of templates) {
            const usage = (row.usageJson && typeof row.usageJson === "object") ? (row.usageJson as Record<string, any>) : {};
            jdExtractionCost += llmCost(usage, "jdExtraction");
            questionBankCost += llmCost(usage, "questionBank");
        }

        let evalCost = 0, llmGenerationCost = 0, ttsCost = 0, sttCost = 0;
        for (const row of sessions) {
            const usage = (row.usageJson && typeof row.usageJson === "object") ? (row.usageJson as Record<string, any>) : {};
            evalCost += llmCost(usage, "eval");
            llmGenerationCost += llmCost(usage, "llmGeneration");
            ttsCost += n(usage.tts?.costUsd);
            sttCost += n(usage.stt?.costUsd);
        }

        const totalCost = jdExtractionCost + questionBankCost + evalCost + llmGenerationCost + ttsCost + sttCost;

        return NextResponse.json({
            templateCount,
            sessionCount,
            totals: {
                jdExtractionCost, questionBankCost, evalCost, llmGenerationCost, ttsCost, sttCost, totalCost,
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
