import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";
import { formatOrgPlan, synthesizedPlanBilling } from "@/lib/org-plans";
import {
  numOr0 as n,
  roundCost as round,
  refreshOrgUsageSummaryDebounced,
  aggregateOrgUsageEvents,
  type UsageEventAgg,
} from "@/lib/usage-metrics";

/**
 * GET /api/super-admin/orgs/[id]/usage
 * Single overview fetch for the redesigned super-admin usage view.
 *
 * UsageEvent is the sole source of truth: every section/sub-section total is
 * summed out of the org's UsageEvent entity rows (isTest=false) via the shared
 * aggregateOrgUsageEvents helper. legacy/ledger split fields are retired — they
 * always report ledger cost with legacy 0 now that the blob is gone. The JSON
 * response shape is unchanged so the restyled React components need no edits.
 */

// Primary model = highest-cost provider:model in an aggregate's byModel map.
function primaryModel(byModel: UsageEventAgg["byModel"]): string | null {
  let best: string | null = null;
  let bestCost = -1;
  for (const v of Object.values(byModel)) {
    if (v.costUsd > bestCost) { bestCost = v.costUsd; best = v.model; }
  }
  return best;
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
      },
    });
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    // Real spend only (test rows are surfaced separately via /api/test/billing).
    const entityRows = await prisma.usageEvent.findMany({
      where: { organizationId: id, isTest: false },
      select: { feature: true, usage: true },
    });
    const agg = aggregateOrgUsageEvents(entityRows);

    // ---- Section totals ----
    const jdCost = agg.jdExtraction.costUsd;
    const questionBankCost = agg.questionBank.costUsd;
    const resumeExtractionCost = agg.resumeExtraction.costUsd;
    const resumeReportCost = agg.resumeReport.costUsd;
    const resumeCost = resumeExtractionCost + resumeReportCost;
    const interviewLlmCost = agg.eval.costUsd + agg.llmGeneration.costUsd;
    const interviewTtsCost = agg.interviewTts.costUsd;
    const interviewSttCost = agg.interviewStt.costUsd;
    const interviewCost = interviewLlmCost + interviewTtsCost + interviewSttCost;
    const reportCost = agg.report.costUsd;

    // ledgerCostUsd = the section cost; legacyCostUsd retired to 0 (blob gone).
    const sections = [
      {
        key: "jdExtraction" as const, label: "JD Extraction",
        costUsd: round(jdCost), runs: agg.jdExtraction.calls,
        primaryModel: primaryModel(agg.jdExtraction.byModel),
        ledgerCostUsd: round(jdCost), legacyCostUsd: 0,
        inputTokens: agg.jdExtraction.inputTokens, outputTokens: agg.jdExtraction.outputTokens,
      },
      {
        key: "questionBank" as const, label: "Question Bank",
        costUsd: round(questionBankCost), runs: agg.questionBank.calls,
        primaryModel: primaryModel(agg.questionBank.byModel),
        ledgerCostUsd: round(questionBankCost), legacyCostUsd: 0,
        inputTokens: agg.questionBank.inputTokens, outputTokens: agg.questionBank.outputTokens,
      },
      {
        key: "resumeExtraction" as const, label: "Resume Extraction",
        costUsd: round(resumeExtractionCost), runs: agg.resumeExtraction.calls,
        primaryModel: primaryModel(agg.resumeExtraction.byModel),
        ledgerCostUsd: round(resumeExtractionCost), legacyCostUsd: 0,
        inputTokens: agg.resumeExtraction.inputTokens, outputTokens: agg.resumeExtraction.outputTokens,
      },
      {
        key: "resumeReport" as const, label: "Resume Report",
        costUsd: round(resumeReportCost), runs: agg.resumeReport.calls,
        primaryModel: primaryModel(agg.resumeReport.byModel),
        ledgerCostUsd: round(resumeReportCost), legacyCostUsd: 0,
        inputTokens: agg.resumeReport.inputTokens, outputTokens: agg.resumeReport.outputTokens,
      },
      {
        key: "interview" as const, label: "Interview",
        costUsd: round(interviewCost), runs: agg.eval.calls,
        primaryModel: primaryModel(agg.eval.byModel),
        ledgerCostUsd: round(interviewCost), legacyCostUsd: 0,
        inputTokens: agg.eval.inputTokens + agg.llmGeneration.inputTokens,
        outputTokens: agg.eval.outputTokens + agg.llmGeneration.outputTokens,
      },
      {
        key: "finalReport" as const, label: "Final Report",
        costUsd: round(reportCost), runs: agg.report.calls,
        primaryModel: primaryModel(agg.report.byModel),
        ledgerCostUsd: round(reportCost), legacyCostUsd: 0,
        inputTokens: agg.report.inputTokens, outputTokens: agg.report.outputTokens,
      },
    ];

    // ---- Interview sub-sections ----
    const subSections = [
      {
        key: "tts" as const, label: "TTS",
        costUsd: round(interviewTtsCost), ledgerCostUsd: round(interviewTtsCost), legacyCostUsd: 0,
        calls: agg.interviewTts.calls,
        primaryModel: primaryModel(agg.interviewTts.byModel),
        units: { ttsCharacters: agg.interviewTts.ttsCharacters },
      },
      {
        key: "stt" as const, label: "STT",
        costUsd: round(interviewSttCost), ledgerCostUsd: round(interviewSttCost), legacyCostUsd: 0,
        calls: agg.interviewStt.calls,
        primaryModel: primaryModel(agg.interviewStt.byModel),
        units: { sttAudioSeconds: agg.interviewStt.sttAudioSeconds },
      },
      {
        key: "generation" as const, label: "Generation",
        costUsd: round(agg.llmGeneration.costUsd), ledgerCostUsd: round(agg.llmGeneration.costUsd), legacyCostUsd: 0,
        calls: agg.llmGeneration.calls,
        primaryModel: primaryModel(agg.llmGeneration.byModel),
        units: { inputTokens: agg.llmGeneration.inputTokens, outputTokens: agg.llmGeneration.outputTokens },
      },
      {
        key: "eval" as const, label: "Eval",
        costUsd: round(agg.eval.costUsd), ledgerCostUsd: round(agg.eval.costUsd), legacyCostUsd: 0,
        calls: agg.eval.calls,
        primaryModel: primaryModel(agg.eval.byModel),
        units: { inputTokens: agg.eval.inputTokens, outputTokens: agg.eval.outputTokens },
      },
    ];

    // ---- Per-model pie inside the interview section ----
    const byModel: Array<{ provider: string; model: string; kind: string; costUsd: number }> = [];
    const pushModels = (a: UsageEventAgg, kind: string) => {
      for (const v of Object.values(a.byModel)) {
        if (v.costUsd <= 0) continue;
        byModel.push({ provider: v.provider, model: v.model, kind, costUsd: round(v.costUsd) });
      }
    };
    pushModels(agg.eval, "llm");
    pushModels(agg.llmGeneration, "llm");
    pushModels(agg.interviewTts, "tts");
    pushModels(agg.interviewStt, "stt");
    byModel.sort((a, b) => b.costUsd - a.costUsd);

    // ---- Bottom overview donut ----
    const overview = sections.map((s) => ({ key: s.key, label: s.label, costUsd: s.costUsd }));
    const totalCostUsd = round(jdCost + questionBankCost + resumeCost + interviewCost + reportCost);

    // ---- Plan / subscription ----
    const synth = synthesizedPlanBilling(org.billingPlan);
    const planPriceUsd = org.planPriceUsd ?? synth.priceUsd;
    const billingCycle = org.billingCycle ?? synth.billingCycle;
    const nextBillingDate = (org.nextBillingDate ?? synth.nextBillingDate).toISOString();

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
