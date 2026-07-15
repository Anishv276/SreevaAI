import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";
import { formatOrgPlan, synthesizedPlanBilling } from "@/lib/org-plans";
import {
  numOr0 as n,
  roundCost as round,
  clampLegacyCost as clampLegacy,
  primaryModelFromByModel as primaryModel,
  refreshOrgUsageSummaryDebounced,
  type UsageBucket as Bucket,
} from "@/lib/usage-metrics";

/**
 * GET /api/super-admin/orgs/[id]/usage
 * Single overview fetch for the redesigned super-admin usage view.
 *
 * Section/sub-section TOTALS come from the org blob (platformUsageMetrics.billing,
 * written by billing.py — the source of truth). The UsageEvent ledger provides
 * per-item detail (fetched separately via .../usage/events) and the ledger vs
 * blob delta becomes the "Legacy (before detailed tracking)" remainder here.
 *
 * Shared bucket-reading/rounding/reconciliation helpers live in lib/usage-metrics.ts
 * so this route and the OrgUsageSummary refresh can never disagree on a number.
 */

// Real call count for a byModel map -- sums each entry's own runs/sessions
// count rather than counting distinct models, which undercounts whenever
// multiple calls share one model.
function callsFromByModel(byModel: Record<string, any> | null | undefined): number {
  if (!byModel || typeof byModel !== "object") return 0;
  return Object.values(byModel).reduce(
    (sum, v) => sum + n((v as any)?.runs ?? (v as any)?.sessions ?? (v as any)?.calls),
    0
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }
    const { id } = await params;

    const org = await prisma.organizationDetails.findUnique({
      where: { id },
      select: {
        id: true, name: true, urlSlug: true, orgStatus: true, billingPlan: true,
        planPriceUsd: true, billingCycle: true, nextBillingDate: true,
        totalInterviewsAllowed: true, totalInterviewsUsed: true, billingCreditsUsed: true,
        platformUsageMetrics: true,
      },
    });
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const usageMetrics = (org.platformUsageMetrics && typeof org.platformUsageMetrics === "object")
      ? (org.platformUsageMetrics as Record<string, any>) : {};
    const billing = (usageMetrics.billing && typeof usageMetrics.billing === "object")
      ? (usageMetrics.billing as Record<string, Bucket>) : {};

    const B = (k: string): Bucket => billing[k] || {};

    // ---- Ledger sums per feature (from UsageEvent) ----
    const grouped = await prisma.usageEvent.groupBy({
      by: ["feature"],
      where: { organizationId: id },
      _sum: { costUsd: true, calls: true },
    });
    const ledgerByFeature = new Map<string, { costUsd: number; calls: number }>();
    for (const g of grouped) {
      ledgerByFeature.set(g.feature, { costUsd: n(g._sum.costUsd), calls: n(g._sum.calls) });
    }
    const ledgerCost = (feat: string) => ledgerByFeature.get(feat)?.costUsd ?? 0;

    // ---- Section totals (blob) ----
    const jdCost = n(B("jdExtraction").costUsd);
    const resumeExtractionCost = n(B("resumeExtraction").costUsd);
    const resumeReportCost = n(B("resumeReport").costUsd);
    const resumeCost = resumeExtractionCost + resumeReportCost; // kept for the overview donut/grand total
    // Interview section: eval/live (interview bucket LLM) + brief + llmgen + TTS + STT.
    const interviewLlmCost = n(B("interview").costUsd) + n(B("interviewBrief").costUsd) + n(B("interviewLLMGeneration").costUsd);
    const interviewTtsCost = n(B("interview").ttsCostUsd);
    const interviewSttCost = n(B("interview").sttCostUsd);
    const interviewCost = interviewLlmCost + interviewTtsCost + interviewSttCost;
    const reportCost = n(B("interviewReport").costUsd);

    const sections = [
      {
        key: "jdExtraction" as const, label: "JD Extraction",
        costUsd: round(jdCost), runs: n(B("jdExtraction").runs),
        primaryModel: primaryModel(B("jdExtraction").byModel),
        ledgerCostUsd: round(ledgerCost("jdExtraction")),
        legacyCostUsd: clampLegacy(jdCost, ledgerCost("jdExtraction")),
      },
      {
        key: "resumeExtraction" as const, label: "Resume Extraction",
        costUsd: round(resumeExtractionCost), runs: n(B("resumeExtraction").runs),
        primaryModel: primaryModel(B("resumeExtraction").byModel),
        ledgerCostUsd: round(ledgerCost("resumeExtraction")),
        legacyCostUsd: clampLegacy(resumeExtractionCost, ledgerCost("resumeExtraction")),
      },
      {
        key: "resumeReport" as const, label: "Resume Report",
        costUsd: round(resumeReportCost), runs: n(B("resumeReport").runs),
        primaryModel: primaryModel(B("resumeReport").byModel),
        ledgerCostUsd: round(ledgerCost("resumeReport")),
        legacyCostUsd: clampLegacy(resumeReportCost, ledgerCost("resumeReport")),
      },
      {
        key: "interview" as const, label: "Interview",
        costUsd: round(interviewCost), runs: n(B("interview").runs),
        primaryModel: primaryModel(B("interview").byModel),
        ledgerCostUsd: round(
          ledgerCost("interviewEval") + ledgerCost("interviewBrief") +
          ledgerCost("interviewLLMGeneration") + ledgerCost("interviewSession") +
          ledgerCost("voicePreview")
        ),
        legacyCostUsd: clampLegacy(
          interviewCost,
          ledgerCost("interviewEval") + ledgerCost("interviewBrief") +
          ledgerCost("interviewLLMGeneration") + ledgerCost("interviewSession") +
          ledgerCost("voicePreview")
        ),
      },
      {
        key: "finalReport" as const, label: "Final Report",
        costUsd: round(reportCost), runs: n(B("interviewReport").runs),
        primaryModel: primaryModel(B("interviewReport").byModel),
        ledgerCostUsd: round(ledgerCost("interviewReport")),
        legacyCostUsd: clampLegacy(reportCost, ledgerCost("interviewReport")),
      },
    ];

    // ---- Interview sub-sections ----
    const evalBucket = B("interview"); // eval/live-session LLM shares this bucket
    const briefBucket = B("interviewBrief");
    const genBucket = B("interviewLLMGeneration");

    const subSections = [
      {
        // ledger/legacy split for TTS & STT is refined below from the
        // interviewSession/voicePreview feature grouped by kind.
        key: "tts" as const, label: "TTS",
        costUsd: round(interviewTtsCost),
        ledgerCostUsd: 0,
        legacyCostUsd: 0,
        calls: callsFromByModel(evalBucket.ttsByModel),
        primaryModel: primaryModel(evalBucket.ttsByModel),
        units: { ttsCharacters: n(evalBucket.ttsCharacters) },
      },
      {
        key: "stt" as const, label: "STT",
        costUsd: round(interviewSttCost),
        ledgerCostUsd: 0, legacyCostUsd: 0,
        calls: callsFromByModel(evalBucket.sttByModel),
        primaryModel: primaryModel(evalBucket.sttByModel),
        units: { sttAudioSeconds: n(evalBucket.sttAudioSeconds) },
      },
      {
        key: "generation" as const, label: "Generation",
        costUsd: round(n(genBucket.costUsd)),
        ledgerCostUsd: round(ledgerCost("interviewLLMGeneration")),
        legacyCostUsd: clampLegacy(n(genBucket.costUsd), ledgerCost("interviewLLMGeneration")),
        calls: n(genBucket.runs),
        primaryModel: primaryModel(genBucket.byModel),
        units: { inputTokens: n(genBucket.inputTokens), outputTokens: n(genBucket.outputTokens) },
      },
      {
        key: "eval" as const, label: "Eval",
        costUsd: round(n(evalBucket.costUsd)),
        ledgerCostUsd: round(ledgerCost("interviewEval")),
        legacyCostUsd: clampLegacy(n(evalBucket.costUsd), ledgerCost("interviewEval")),
        calls: n(evalBucket.runs),
        primaryModel: primaryModel(evalBucket.byModel),
        units: { inputTokens: n(evalBucket.inputTokens), outputTokens: n(evalBucket.outputTokens) },
      },
      {
        key: "brief" as const, label: "Brief",
        costUsd: round(n(briefBucket.costUsd)),
        ledgerCostUsd: round(ledgerCost("interviewBrief")),
        legacyCostUsd: clampLegacy(n(briefBucket.costUsd), ledgerCost("interviewBrief")),
        calls: n(briefBucket.runs),
        primaryModel: primaryModel(briefBucket.byModel),
        units: { inputTokens: n(briefBucket.inputTokens), outputTokens: n(briefBucket.outputTokens) },
      },
    ];

    // Refine TTS/STT ledger split from the interviewSession feature by kind.
    const sessionByKind = await prisma.usageEvent.groupBy({
      by: ["kind"],
      where: { organizationId: id, feature: { in: ["interviewSession", "voicePreview"] } },
      _sum: { costUsd: true },
    });
    const sessionKindCost = new Map<string, number>();
    for (const g of sessionByKind) sessionKindCost.set(g.kind, n(g._sum.costUsd));
    const tts = subSections.find((s) => s.key === "tts")!;
    const stt = subSections.find((s) => s.key === "stt")!;
    tts.ledgerCostUsd = round(sessionKindCost.get("tts") || 0);
    tts.legacyCostUsd = clampLegacy(interviewTtsCost, tts.ledgerCostUsd);
    stt.ledgerCostUsd = round(sessionKindCost.get("stt") || 0);
    stt.legacyCostUsd = clampLegacy(interviewSttCost, stt.ledgerCostUsd);

    // ---- Per-model pie inside the interview section (from blob byModel maps) ----
    const byModel: Array<{ provider: string; model: string; kind: string; costUsd: number }> = [];
    const pushModels = (map: Record<string, any> | undefined, kind: string) => {
      if (!map) return;
      for (const [key, v] of Object.entries(map)) {
        const cost = n((v as any)?.costUsd);
        if (cost <= 0) continue;
        const parts = key.split(":");
        const provider = (v as any)?.provider || (parts.length >= 2 ? parts[0] : "");
        const model = (v as any)?.model || (parts.length >= 2 ? parts.slice(1).join(":") : key);
        byModel.push({ provider: String(provider), model: String(model), kind, costUsd: round(cost) });
      }
    };
    pushModels(evalBucket.byModel, "llm");
    pushModels(briefBucket.byModel, "llm");
    pushModels(genBucket.byModel, "llm");
    pushModels(evalBucket.ttsByModel, "tts");
    pushModels(evalBucket.sttByModel, "stt");
    byModel.sort((a, b) => b.costUsd - a.costUsd);

    // ---- Bottom overview donut: section vs section ----
    const overview = sections.map((s) => ({ key: s.key, label: s.label, costUsd: s.costUsd }));
    const totalCostUsd = round(jdCost + resumeCost + interviewCost + reportCost);

    // ---- Plan / subscription (stored, with synthesized fallback) ----
    const synth = synthesizedPlanBilling(org.billingPlan);
    const planPriceUsd = org.planPriceUsd ?? synth.priceUsd;
    const billingCycle = org.billingCycle ?? synth.billingCycle;
    const nextBillingDate = (org.nextBillingDate ?? synth.nextBillingDate).toISOString();

    // Keep the OrgUsageSummary snapshot table current whenever anyone actually
    // looks at this org's usage. Debounced (skips entirely, no DB round-trip,
    // if already refreshed recently) so rapid page views/section navigation
    // don't pile up extra concurrent queries on top of this route's own --
    // an earlier non-debounced version of this call caused real connection
    // pool exhaustion under normal usage-page navigation.
    refreshOrgUsageSummaryDebounced(id);

    return NextResponse.json({
      org: {
        id: org.id,
        name: org.name,
        slug: org.urlSlug,
        status: org.orgStatus,
        plan: org.billingPlan,
        planLabel: formatOrgPlan(org.billingPlan) || "Starter",
        planPriceUsd,
        billingCycle,
        nextBillingDate,
        interviewsAllowed: n(org.totalInterviewsAllowed),
        interviewsUsed: n(org.totalInterviewsUsed),
        creditsUsed: round(n(org.billingCreditsUsed)),
        totalCostUsd,
      },
      sections,
      interview: {
        totalCostUsd: round(interviewCost),
        subSections,
        byModel,
      },
      overview,
      // testUsage is fetched by the UI from /api/test/billing?orgId= (unchanged endpoint).
      testUsage: null,
    });
  } catch (error) {
    return apiErrorResponse({
      route: "/api/super-admin/orgs/[id]/usage",
      method: "GET",
      error,
      body: { error: "Failed to fetch usage overview" },
      status: 500,
      logLabel: "Error fetching org usage overview:",
    });
  }
}
