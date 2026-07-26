import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdminRole } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

// Test-session billing, sourced from UsageEvent (isTest=true) — the same
// entity-ledger rows real billing uses, just excluded from real cost totals.
// Returns aggregated + per-interview test spend for the super-admin billing page.

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function llmCost(usage: Record<string, any>, path: string): number {
  const arr = Array.isArray(usage[path]?.llm) ? usage[path].llm : [];
  return arr.reduce((s: number, m: any) => s + n(m.costUsd), 0);
}

function llmCalls(usage: Record<string, any>, path: string): number {
  const arr = Array.isArray(usage[path]?.llm) ? usage[path].llm : [];
  return arr.reduce((s: number, m: any) => s + n(m.calls), 0);
}

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session || !isSuperAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { searchParams } = new URL(request.url);
        const orgId = searchParams.get("orgId");
        if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

        const entities = await prisma.usageEvent.findMany({
            where: { organizationId: orgId, feature: "interview", isTest: true },
            orderBy: { createdAt: "desc" },
            take: 100,
            select: {
                id: true, createdAt: true, updatedAt: true, usage: true,
                jobTitle: true, candidateName: true, applicationId: true,
            },
        });

        let totalTts = 0, totalStt = 0, totalEval = 0, totalGeneration = 0, totalReport = 0, totalCost = 0;

        const rows = entities.map((e) => {
            const usage = (e.usage && typeof e.usage === "object") ? (e.usage as Record<string, any>) : {};
            const evalCost = llmCost(usage, "eval");
            const generationCost = llmCost(usage, "llmGeneration");
            const reportCost = llmCost(usage, "report");
            const tts = n(usage.tts?.costUsd);
            const stt = n(usage.stt?.costUsd);
            const cost = evalCost + generationCost + reportCost + tts + stt;
            totalTts += tts; totalStt += stt; totalEval += evalCost;
            totalGeneration += generationCost; totalReport += reportCost;
            totalCost += cost;

            return {
                id: e.id,
                candidate: e.candidateName || "Unknown",
                job: e.jobTitle || "—",
                date: e.createdAt.toISOString(),
                ttsCharacters: n(usage.tts?.characters),
                sttAudioSeconds: n(usage.stt?.seconds),
                ttsCost: tts,
                sttCost: stt,
                evalCost,
                evalCalls: llmCalls(usage, "eval"),
                generationCost,
                generationCalls: llmCalls(usage, "llmGeneration"),
                reportCost,
                reportCalls: llmCalls(usage, "report"),
                totalCost: cost,
            };
        });

        return NextResponse.json({
            rows,
            totals: {
                ttsCost: totalTts, sttCost: totalStt, evalCost: totalEval,
                generationCost: totalGeneration, reportCost: totalReport,
                totalCost,
            },
            count: entities.length,
        });
    } catch (e) {
        return apiErrorResponse({
            route: "/api/test/billing",
            method: "GET",
            error: e,
            body: { error: "Failed" },
            status: 500,
            logLabel: "[TEST_BILLING]",
        });
    }
}
