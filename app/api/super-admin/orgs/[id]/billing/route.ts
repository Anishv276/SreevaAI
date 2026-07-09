import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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
                id: true, platformUsageMetrics: true,
                llmResumeExtraction: true, llmJdExtraction: true,
                llmInterviewReport: true, llmResumeReport: true,
                llmInterviewEval: true, llmInterviewLive: true, llmInterviewBrief: true,
            }
        });
        if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

        // Interview.interviewDuration is the single source of truth for duration
        // (see app/api/admin/billing/history/route.ts) -- billingSnapshot.durationSec
        // comes from a separate, largely-unused write path and must never win over it.
        const interviews = await prisma.$queryRaw<Array<{
            testBillingMetrics: Record<string, any> | null;
            interviewDuration: number | null;
        }>>(Prisma.sql`
            SELECT i."testBillingMetrics",
                   COALESCE(
                       i."interviewDuration",
                       (i."billingSnapshot"->>'durationSec')::int
                   ) AS "interviewDuration"
            FROM "Interview" i
            JOIN "Application" a ON a.id = i."applicationId"
            JOIN "Job" d ON d.id = a."jobId"
            WHERE d."orgId" = ${id}
            AND i."isDeleted" = false AND a."isDeleted" = false AND d."isDeleted" = false
        `);

        const orgUsage = (org.platformUsageMetrics && typeof org.platformUsageMetrics === "object")
            ? (org.platformUsageMetrics as Record<string, any>)
            : {};

        const aggregates: Record<string, any> = {
            resumeExtraction:      { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: org.llmResumeExtraction },
            jdExtraction:          { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: org.llmJdExtraction },
            interviewReport:       { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: org.llmInterviewReport },
            resumeReport:          { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: org.llmResumeReport },
            interviewEvaluation:   { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: org.llmInterviewEval },
            interviewLLMGeneration:{ runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: org.llmInterviewLive },
            interviewBrief:        { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: org.llmInterviewBrief },
            interview: {
                runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0,
                sessionDuration: 0,
                ttsCharacters: 0, ttsCostUsd: 0, sttAudioSeconds: 0, sttCostUsd: 0,
                model: org.llmInterviewLive,
                ttsProviders: {} as Record<string, { characters: number; costUsd: number }>,
                sttProviders: {} as Record<string, { seconds: number; costUsd: number }>,
            },
        };

        // testBillingMetrics: only used for sub-feature token breakdowns (eval / brief / llmgen).
        // Costs and interview-level data (TTS, STT, LLM tokens) come from billing bucket below.
        for (const row of interviews) {
            const m = row.testBillingMetrics as Record<string, any> || {};
            if (m.skipReport) continue;
            // Accumulate actual session wall-clock time from billingSnapshot.durationSec or interviewDuration
            aggregates.interview.sessionDuration += Number(row.interviewDuration || 0);

            // Evaluation runs/tokens (per-turn scoring) — cost comes from billing.interview
            aggregates.interviewEvaluation.runs        += Number(m.evaluationRuns   || 0);
            aggregates.interviewEvaluation.inputTokens += Number(m.evalInputTokens  || 0);
            aggregates.interviewEvaluation.outputTokens+= Number(m.evalOutputTokens || 0);

            // LLM generation runs/tokens — cost comes from billing.interviewLLMGeneration
            aggregates.interviewLLMGeneration.runs        += Number(m.llmGenerations    || 0);
            aggregates.interviewLLMGeneration.inputTokens += Number(m.llmgenInputTokens || 0);
            aggregates.interviewLLMGeneration.outputTokens+= Number(m.llmgenOutputTokens|| 0);

            // Brief runs/tokens — cost comes from billing.interviewBrief
            aggregates.interviewBrief.runs        += Number(m.briefGenerations  || 0);
            aggregates.interviewBrief.inputTokens += Number(m.briefInputTokens  || 0);
            aggregates.interviewBrief.outputTokens+= Number(m.briefOutputTokens || 0);
        }

        // All costs and interview-level aggregates come from usageMetrics.billing (billing.py accurate data).
        const billingBucket = (orgUsage.billing && typeof orgUsage.billing === "object")
            ? (orgUsage.billing as Record<string, any>)
            : {};

        // Extract the primary model name from a byModel map (highest-cost entry wins).
        const primaryModel = (byModel: Record<string, any> | null | undefined): string | null => {
            if (!byModel || typeof byModel !== "object") return null;
            let best: string | null = null;
            let bestCost = -1;
            for (const [key, v] of Object.entries(byModel)) {
                const cost = Number((v as any)?.costUsd || 0);
                if (cost > bestCost) {
                    bestCost = cost;
                    // key is "provider:model" — strip provider prefix
                    const parts = key.split(":");
                    best = parts.length >= 2 ? parts.slice(1).join(":") : key;
                }
            }
            return best;
        };

        // Extraction / report phases: all fields from billing bucket.
        for (const phase of ["resumeExtraction", "jdExtraction", "interviewReport", "resumeReport"]) {
            const b = billingBucket[phase];
            if (!b || typeof b !== "object" || !aggregates[phase]) continue;
            aggregates[phase].runs         += Number(b.runs         || 0);
            aggregates[phase].inputTokens  += Number(b.inputTokens  || 0);
            aggregates[phase].outputTokens += Number(b.outputTokens || 0);
            aggregates[phase].costUsd      += Number(b.costUsd      || 0);
            const m = primaryModel(b.byModel);
            if (m) aggregates[phase].model = m;
        }

        // Brief / LLM gen: runs+tokens from testBillingMetrics above, cost+model from billing bucket.
        for (const phase of ["interviewBrief", "interviewLLMGeneration"]) {
            const b = billingBucket[phase];
            if (!b || typeof b !== "object" || !aggregates[phase]) continue;
            aggregates[phase].costUsd += Number(b.costUsd || 0);
            const m = primaryModel(b.byModel);
            if (m) aggregates[phase].model = m;
        }

        // Interview: all data from billing bucket (accurate Sarvam/Deepgram rates, exact token counts).
        const ivb = billingBucket.interview;
        if (ivb && typeof ivb === "object") {
            aggregates.interview.runs         += Number(ivb.runs         || 0);
            aggregates.interview.inputTokens  += Number(ivb.inputTokens  || 0);
            aggregates.interview.outputTokens += Number(ivb.outputTokens || 0);
            aggregates.interview.costUsd      += Number(ivb.costUsd      || 0);

            // TTS accurate totals
            aggregates.interview.ttsCharacters += Number(ivb.ttsCharacters || 0);
            aggregates.interview.ttsCostUsd    += Number(ivb.ttsCostUsd    || 0);

            // TTS per-provider breakdown from billing.py ttsByModel
            const ttsByModel = (ivb.ttsByModel && typeof ivb.ttsByModel === "object") ? ivb.ttsByModel : {};
            for (const entry of Object.values(ttsByModel)) {
                const e = entry as Record<string, any>;
                const provider = String(e.provider || "UNKNOWN").toUpperCase();
                if (!aggregates.interview.ttsProviders[provider])
                    aggregates.interview.ttsProviders[provider] = { characters: 0, costUsd: 0 };
                aggregates.interview.ttsProviders[provider].characters += Number(e.characters || 0);
                aggregates.interview.ttsProviders[provider].costUsd    += Number(e.costUsd    || 0);
            }

            // STT accurate totals
            aggregates.interview.sttAudioSeconds += Number(ivb.sttAudioSeconds || 0);
            aggregates.interview.sttCostUsd      += Number(ivb.sttCostUsd      || 0);

            // STT per-provider breakdown from billing.py sttByModel
            const sttByModel = (ivb.sttByModel && typeof ivb.sttByModel === "object") ? ivb.sttByModel : {};
            for (const entry of Object.values(sttByModel)) {
                const e = entry as Record<string, any>;
                const provider = String(e.provider || "deepgram").toLowerCase();
                if (!aggregates.interview.sttProviders[provider])
                    aggregates.interview.sttProviders[provider] = { seconds: 0, costUsd: 0 };
                aggregates.interview.sttProviders[provider].seconds  += Number(e.audioSeconds || 0);
                aggregates.interview.sttProviders[provider].costUsd  += Number(e.costUsd      || 0);
            }

            // Update model labels from actual billing data
            const evalModel = primaryModel(ivb.byModel);
            if (evalModel) {
                aggregates.interview.model = evalModel;
                aggregates.interviewEvaluation.model = evalModel;
            }
        }

        // Round costs
        for (const key of Object.keys(aggregates)) {
            const f = aggregates[key];
            if (f.costUsd)    f.costUsd    = Math.round(f.costUsd    * 10000) / 10000;
            if (f.ttsCostUsd) f.ttsCostUsd = Math.round(f.ttsCostUsd * 10000) / 10000;
            if (f.sttCostUsd) f.sttCostUsd = Math.round(f.sttCostUsd * 10000) / 10000;
            if (f.ttsProviders) {
                for (const p of Object.keys(f.ttsProviders))
                    f.ttsProviders[p].costUsd = Math.round(f.ttsProviders[p].costUsd * 10000) / 10000;
            }
            if (f.sttProviders) {
                for (const p of Object.keys(f.sttProviders))
                    f.sttProviders[p].costUsd = Math.round(f.sttProviders[p].costUsd * 10000) / 10000;
            }
        }

        return NextResponse.json(aggregates);
    } catch (error) {
        console.error("Error fetching org billing:", error);
        return NextResponse.json({ error: "Failed to fetch billing data" }, { status: 500 });
    }
}
