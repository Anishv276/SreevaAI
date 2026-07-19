import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdminRole } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

// Per-session demo billing breakdown for the super-admin billing page's
// "Demo" card drill-down. One row per DemoSession: name, email, template,
// live/eval/llmGeneration run counts + cost, TTS/STT cost, session total.
//
// The template's one-time JD-extraction + brief cost is NOT repeated on every
// session row (it isn't a per-session cost -- every session of a template
// reuses the same pre-generated brief). It's attached only to the row for
// that template's FIRST (earliest) session, same as UsageEvent's jd:{jobId}
// row is a separate entity from interview:{appId} rows, never duplicated
// across every interview under that job.

function n(v: unknown): number {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
}

function llmCost(usage: Record<string, any>, path: string): number {
    const arr = Array.isArray(usage?.[path]?.llm) ? usage[path].llm : [];
    return arr.reduce((s: number, m: any) => s + n(m.costUsd), 0);
}

function llmCalls(usage: Record<string, any>, path: string): number {
    const arr = Array.isArray(usage?.[path]?.llm) ? usage[path].llm : [];
    return arr.reduce((s: number, m: any) => s + n(m.calls), 0);
}

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session || !isSuperAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { searchParams } = new URL(request.url);
        const take = Math.min(200, Math.max(1, Number(searchParams.get("take")) || 100));

        const sessions = await prisma.demoSession.findMany({
            where: { isDeleted: false },
            orderBy: { startedAt: "desc" },
            take,
            select: {
                id: true, clientName: true, clientEmail: true, status: true, startedAt: true,
                template: { select: { id: true, title: true, roleTitle: true } },
                usageJson: true,
            },
        });

        // First (earliest) session per template gets the template's one-time
        // JD-extraction + brief cost attached to its row.
        const earliestSessionIdByTemplate = new Map<string, string>();
        for (const s of [...sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
            if (!earliestSessionIdByTemplate.has(s.template.id)) {
                earliestSessionIdByTemplate.set(s.template.id, s.id);
            }
        }
        const templateIds = [...new Set(sessions.map((s) => s.template.id))];
        const templates = templateIds.length
            ? await prisma.demoTemplate.findMany({
                where: { id: { in: templateIds } },
                select: { id: true, usageJson: true },
            })
            : [];
        const templateUsageById = new Map(templates.map((t) => [t.id, t.usageJson as Record<string, any>]));

        const rows = sessions.map((s) => {
            const usage = (s.usageJson && typeof s.usageJson === "object") ? (s.usageJson as Record<string, any>) : {};
            const liveCost = llmCost(usage, "live");
            const evalCost = llmCost(usage, "eval");
            const llmGenerationCost = llmCost(usage, "llmGeneration");
            const ttsCost = n(usage.tts?.costUsd);
            const sttCost = n(usage.stt?.costUsd);

            const isFirstSessionForTemplate = earliestSessionIdByTemplate.get(s.template.id) === s.id;
            const templateUsage = isFirstSessionForTemplate ? templateUsageById.get(s.template.id) : null;
            const jdExtractionCost = templateUsage ? llmCost(templateUsage, "jdExtraction") : 0;
            const briefCost = templateUsage ? llmCost(templateUsage, "brief") : 0;

            const totalCost = liveCost + evalCost + llmGenerationCost + ttsCost + sttCost + jdExtractionCost + briefCost;

            return {
                id: s.id,
                clientName: s.clientName,
                clientEmail: s.clientEmail,
                templateTitle: s.template.title,
                roleTitle: s.template.roleTitle,
                status: s.status,
                startedAt: s.startedAt.toISOString(),
                isFirstSessionForTemplate,
                jdExtractionCost,
                briefCost,
                briefCalls: templateUsage ? llmCalls(templateUsage, "brief") : 0,
                liveCost,
                liveCalls: llmCalls(usage, "live"),
                evalCost,
                evalCalls: llmCalls(usage, "eval"),
                llmGenerationCost,
                llmGenerationCalls: llmCalls(usage, "llmGeneration"),
                ttsCost,
                ttsCharacters: n(usage.tts?.characters),
                sttCost,
                sttAudioSeconds: n(usage.stt?.seconds),
                totalCost,
            };
        });

        return NextResponse.json({ rows, count: rows.length });
    } catch (e) {
        return apiErrorResponse({
            route: "/api/super-admin/billing/demo/sessions",
            method: "GET",
            error: e,
            body: { error: "Failed" },
            status: 500,
            logLabel: "[DEMO_BILLING_SESSIONS]",
        });
    }
}
