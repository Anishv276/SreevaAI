import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";
import { aggregateOrgUsageEvents, type UsageEventAgg } from "@/lib/usage-metrics";

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
                id: true,
                llmResumeExtraction: true, llmJdExtraction: true, llmQuestionBank: true,
                llmInterviewReport: true, llmResumeReport: true,
                llmInterviewEval: true, llmInterviewLive: true,
            }
        });
        if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

        // Interview.durationInSeconds is the single source of truth for duration.
        const interviews = await prisma.$queryRaw<Array<{
            interviewDuration: number | null;
        }>>(Prisma.sql`
            SELECT i."durationInSeconds" AS "interviewDuration"
            FROM "Interview" i
            JOIN "Application" a ON a.id = i."applicationId"
            JOIN "Job" d ON d.id = a."jobId"
            WHERE d."organizationId" = ${id}
            AND i."isDeleted" = false AND a."isDeleted" = false AND d."isDeleted" = false
            AND i."isTestSession" = false
        `);

        // All costs come from the UsageEvent ledger (real spend only).
        const entityRows = await prisma.usageEvent.findMany({
            where: { organizationId: id, isTest: false },
            select: { feature: true, usage: true },
        });
        const agg = aggregateOrgUsageEvents(entityRows);

        const aggregates: Record<string, any> = {
            resumeExtraction:      { runs: agg.resumeExtraction.calls, inputTokens: agg.resumeExtraction.inputTokens, outputTokens: agg.resumeExtraction.outputTokens, costUsd: agg.resumeExtraction.costUsd, model: primaryModel(agg.resumeExtraction.byModel) || org.llmResumeExtraction },
            jdExtraction:          { runs: agg.jdExtraction.calls, inputTokens: agg.jdExtraction.inputTokens, outputTokens: agg.jdExtraction.outputTokens, costUsd: agg.jdExtraction.costUsd, model: primaryModel(agg.jdExtraction.byModel) || org.llmJdExtraction },
            interviewReport:       { runs: agg.report.calls, inputTokens: agg.report.inputTokens, outputTokens: agg.report.outputTokens, costUsd: agg.report.costUsd, model: primaryModel(agg.report.byModel) || org.llmInterviewReport },
            resumeReport:          { runs: agg.resumeReport.calls, inputTokens: agg.resumeReport.inputTokens, outputTokens: agg.resumeReport.outputTokens, costUsd: agg.resumeReport.costUsd, model: primaryModel(agg.resumeReport.byModel) || org.llmResumeReport },
            interviewEvaluation:   { runs: agg.eval.calls, inputTokens: agg.eval.inputTokens, outputTokens: agg.eval.outputTokens, costUsd: agg.eval.costUsd, model: primaryModel(agg.eval.byModel) || org.llmInterviewEval },
            interviewLLMGeneration:{ runs: agg.llmGeneration.calls, inputTokens: agg.llmGeneration.inputTokens, outputTokens: agg.llmGeneration.outputTokens, costUsd: agg.llmGeneration.costUsd, model: primaryModel(agg.llmGeneration.byModel) || org.llmInterviewLive },
            questionBank:          { runs: agg.questionBank.calls, inputTokens: agg.questionBank.inputTokens, outputTokens: agg.questionBank.outputTokens, costUsd: agg.questionBank.costUsd, model: primaryModel(agg.questionBank.byModel) || org.llmQuestionBank },
            interview: {
                runs: agg.eval.calls, inputTokens: agg.eval.inputTokens, outputTokens: agg.eval.outputTokens, costUsd: agg.eval.costUsd,
                sessionDuration: interviews.reduce((s, r) => s + Number(r.interviewDuration || 0), 0),
                ttsCharacters: agg.interviewTts.ttsCharacters, ttsCostUsd: agg.interviewTts.costUsd,
                sttAudioSeconds: agg.interviewStt.sttAudioSeconds, sttCostUsd: agg.interviewStt.costUsd,
                model: primaryModel(agg.eval.byModel) || org.llmInterviewLive,
                ttsProviders: {} as Record<string, { characters: number; costUsd: number }>,
                sttProviders: {} as Record<string, { seconds: number; costUsd: number }>,
            },
        };

        // Per-provider TTS/STT breakdown from the ledger's byModel maps.
        for (const v of Object.values(agg.interviewTts.byModel)) {
            const provider = String(v.provider || "UNKNOWN").toUpperCase();
            const p = (aggregates.interview.ttsProviders[provider] ??= { characters: 0, costUsd: 0 });
            p.characters += v.characters; p.costUsd += v.costUsd;
        }
        for (const v of Object.values(agg.interviewStt.byModel)) {
            const provider = String(v.provider || "deepgram").toLowerCase();
            const p = (aggregates.interview.sttProviders[provider] ??= { seconds: 0, costUsd: 0 });
            p.seconds += v.seconds; p.costUsd += v.costUsd;
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
        return apiErrorResponse({
            route: "/api/super-admin/orgs/[id]/billing",
            method: "GET",
            error,
            body: { error: "Failed to fetch billing data" },
            status: 500,
            logLabel: "Error fetching org billing:",
        });
    }
}
