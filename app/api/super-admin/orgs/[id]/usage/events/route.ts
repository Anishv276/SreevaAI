import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

/**
 * GET /api/super-admin/orgs/[id]/usage/events?section=<s>&cursor=<id>&limit=<n>
 * Paginated per-item detail rows for one section of the usage view, from the
 * UsageEvent ledger. Section totals still come from the org blob (the overview
 * route); the `legacy` field here is the blob-minus-ledger remainder rendered as
 * a "Legacy (before detailed tracking)" row so the table reconciles.
 */

// UI section key -> the ledger feature(s) + optional kind it maps to.
const SECTION_MAP: Record<string, { features: string[]; kind?: string; blobKeys: string[] }> = {
  jd: { features: ["jdExtraction"], blobKeys: ["jdExtraction"] },
  resume: { features: ["resumeExtraction"], blobKeys: ["resumeExtraction"] },
  "resume-report": { features: ["resumeReport"], blobKeys: ["resumeReport"] },
  report: { features: ["interviewReport"], blobKeys: ["interviewReport"] },
  "interview-tts": { features: ["interviewSession", "voicePreview"], kind: "tts", blobKeys: [] },
  "interview-stt": { features: ["interviewSession"], kind: "stt", blobKeys: [] },
  "interview-generation": { features: ["interviewLLMGeneration"], blobKeys: ["interviewLLMGeneration"] },
  "interview-eval": { features: ["interviewEval"], blobKeys: ["interview"] },
  "interview-brief": { features: ["interviewBrief"], blobKeys: ["interviewBrief"] },
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
const round = (v: number) => Math.round(v * 1e6) / 1e6;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section") || "";
    const cursor = searchParams.get("cursor");
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 25, 1), 100);

    const map = SECTION_MAP[section];
    if (!map) return NextResponse.json({ error: `Unknown section '${section}'` }, { status: 400 });

    const where = {
      organizationId: id,
      feature: { in: map.features },
      ...(map.kind ? { kind: map.kind } : {}),
    };

    const rows = await prisma.usageEvent.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true, createdAt: true, feature: true, kind: true, provider: true, model: true,
        calls: true, inputTokens: true, cachedInputTokens: true, outputTokens: true,
        ttsCharacters: true, sttAudioSeconds: true, costUsd: true,
        jobTitle: true, candidateName: true, label: true, source: true,
      },
    });

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const extra = rows.pop()!;
      nextCursor = extra.id;
    }

    // Ledger-side section totals (all rows, not just this page).
    const agg = await prisma.usageEvent.aggregate({
      where,
      _sum: { costUsd: true, calls: true },
      _count: { _all: true },
    });
    const ledgerCost = round(n(agg._sum.costUsd));
    const sectionTotals = {
      costUsd: ledgerCost,
      calls: n(agg._sum.calls),
      rows: n(agg._count._all),
    };

    // Legacy remainder = blob section total - ledger total (clamped at 0).
    let legacy: { costUsd: number } | null = null;
    if (map.blobKeys.length > 0) {
      const org = await prisma.organizationDetails.findUnique({
        where: { id },
        select: { platformUsageMetrics: true },
      });
      const um = (org?.platformUsageMetrics && typeof org.platformUsageMetrics === "object")
        ? (org.platformUsageMetrics as Record<string, any>) : {};
      const billing = (um.billing && typeof um.billing === "object") ? (um.billing as Record<string, any>) : {};
      const blobCost = map.blobKeys.reduce((s, k) => s + n(billing[k]?.costUsd), 0);
      const legacyCost = Math.max(0, round(blobCost - ledgerCost));
      if (legacyCost > 0) legacy = { costUsd: legacyCost };
    } else if (map.kind && (section === "interview-tts" || section === "interview-stt")) {
      // TTS/STT live inside the interview blob bucket's tts/sttCostUsd totals.
      const org = await prisma.organizationDetails.findUnique({
        where: { id },
        select: { platformUsageMetrics: true },
      });
      const um = (org?.platformUsageMetrics && typeof org.platformUsageMetrics === "object")
        ? (org.platformUsageMetrics as Record<string, any>) : {};
      const iv = (um.billing?.interview && typeof um.billing.interview === "object") ? um.billing.interview : {};
      const blobCost = section === "interview-tts" ? n(iv.ttsCostUsd) : n(iv.sttCostUsd);
      const legacyCost = Math.max(0, round(blobCost - ledgerCost));
      if (legacyCost > 0) legacy = { costUsd: legacyCost };
    }

    return NextResponse.json({
      rows: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        feature: r.feature,
        kind: r.kind,
        provider: r.provider,
        model: r.model,
        calls: r.calls,
        inputTokens: r.inputTokens,
        cachedInputTokens: r.cachedInputTokens,
        outputTokens: r.outputTokens,
        ttsCharacters: r.ttsCharacters,
        sttAudioSeconds: r.sttAudioSeconds,
        costUsd: round(n(r.costUsd)),
        jobTitle: r.jobTitle,
        candidateName: r.candidateName,
        label: r.label,
        source: r.source,
      })),
      nextCursor,
      sectionTotals,
      legacy,
    });
  } catch (error) {
    return apiErrorResponse({
      route: "/api/super-admin/orgs/[id]/usage/events",
      method: "GET",
      error,
      body: { error: "Failed to fetch usage events" },
      status: 500,
      logLabel: "Error fetching org usage events:",
    });
  }
}
