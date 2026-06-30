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

        const org = await prisma.organization.findUnique({
            where: { id },
            select: { id: true, usageMetrics: true }
        });
        if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

        const interviews = await prisma.$queryRaw<Array<{
            testBillingMetrics: Record<string, any> | null;
        }>>(Prisma.sql`
            SELECT i."testBillingMetrics"
            FROM "Interview" i
            JOIN "Application" a ON a.id = i."applicationId"
            JOIN "Drive" d ON d.id = a."driveId"
            WHERE d."orgId" = ${id}
            AND i."isDeleted" = false AND a."isDeleted" = false AND d."isDeleted" = false
        `);

        const orgUsage = (org.usageMetrics && typeof org.usageMetrics === "object")
            ? (org.usageMetrics as Record<string, any>)
            : {};

        const aggregates: Record<string, any> = {
            resumeExtraction:      { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: "gpt-5.4-mini" },
            jdExtraction:          { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: "gpt-5.4-mini" },
            interviewReport:       { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: "gpt-5.4-mini" },
            resumeReport:          { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: "gpt-5.4-mini" },
            interviewEvaluation:   { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: "gpt-4.1-nano" },
            interviewLLMGeneration:{ runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: "gpt-4.1-mini" },
            interviewBrief:        { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: "gpt-4.1-mini" },
            interview: {
                runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0,
                ttsCharacters: 0, ttsCostUsd: 0, sttAudioSeconds: 0, sttCostUsd: 0,
                model: "gpt-4.1-mini",
                ttsProviders: {} as Record<string, { characters: number; costUsd: number }>,
                sttProviders: {} as Record<string, { seconds: number; costUsd: number }>,
            },
        };

        for (const row of interviews) {
            const m = row.testBillingMetrics as Record<string, any> || {};
            if (m.skipReport) continue;

            // Evaluation runs (per-turn scoring)
            aggregates.interviewEvaluation.runs += Number(m.evaluationRuns || 0);
            aggregates.interviewEvaluation.inputTokens += Number(m.evalInputTokens || 0);
            aggregates.interviewEvaluation.outputTokens += Number(m.evalOutputTokens || 0);

            // LLM generation runs (question generation per turn)
            aggregates.interviewLLMGeneration.runs += Number(m.llmGenerations || 0);
            aggregates.interviewLLMGeneration.inputTokens += Number(m.llmgenInputTokens || 0);
            aggregates.interviewLLMGeneration.outputTokens += Number(m.llmgenOutputTokens || 0);

            // Brief (one per interview)
            aggregates.interviewBrief.runs += Number(m.briefGenerations || 0);
            aggregates.interviewBrief.inputTokens += Number(m.briefInputTokens || 0);
            aggregates.interviewBrief.outputTokens += Number(m.briefOutputTokens || 0);

            // Total LLM cost (still stored as one figure)
            const totalLlmCost = Number(m.llmCost || 0);
            aggregates.interview.runs += 1;
            aggregates.interview.inputTokens += Number(m.llmInputTokens || 0);
            aggregates.interview.outputTokens += Number(m.llmOutputTokens || 0);
            aggregates.interview.costUsd += totalLlmCost;

            // TTS by provider
            const ttsChars = Number(m.ttsChars || 0);
            const ttsCost = Number(m.ttsCost || 0);
            const ttsProvider = (m.ttsProvider || "UNKNOWN").toUpperCase();
            if (ttsChars > 0 || ttsCost > 0) {
                if (!aggregates.interview.ttsProviders[ttsProvider])
                    aggregates.interview.ttsProviders[ttsProvider] = { characters: 0, costUsd: 0 };
                aggregates.interview.ttsProviders[ttsProvider].characters += ttsChars;
                aggregates.interview.ttsProviders[ttsProvider].costUsd += ttsCost;
                aggregates.interview.ttsCharacters += ttsChars;
                aggregates.interview.ttsCostUsd += ttsCost;
            }

            // STT by provider
            const sttSeconds = Number(m.sttSeconds || 0);
            const sttCost = Number(m.sttCost || 0);
            const sttProvider = (m.sttProvider || "deepgram").toLowerCase();
            if (sttSeconds > 0 || sttCost > 0) {
                if (!aggregates.interview.sttProviders[sttProvider])
                    aggregates.interview.sttProviders[sttProvider] = { seconds: 0, costUsd: 0 };
                aggregates.interview.sttProviders[sttProvider].seconds += sttSeconds;
                aggregates.interview.sttProviders[sttProvider].costUsd += sttCost;
                aggregates.interview.sttAudioSeconds += sttSeconds;
                aggregates.interview.sttCostUsd += sttCost;
            }
        }

        // Extraction phases from org usageMetrics (set by report_pipeline)
        const pricePerToken = { input: 2.5 / 1_000_000, output: 10 / 1_000_000 };
        for (const phase of ["resumeExtraction", "jdExtraction", "interviewReport", "resumeReport"]) {
            const entries = orgUsage[phase];
            if (!Array.isArray(entries)) continue;
            for (const entry of entries) {
                if (!entry || typeof entry !== "object") continue;
                const inp = Number(entry.inputTokens || 0);
                const out = Number(entry.outputTokens || 0);
                aggregates[phase].runs += 1;
                aggregates[phase].inputTokens += inp;
                aggregates[phase].outputTokens += out;
                aggregates[phase].costUsd += inp * pricePerToken.input + out * pricePerToken.output;
            }
        }

        // Also check orgUsage for interviewBrief / interviewLLMGeneration if stored there
        for (const phase of ["interviewBrief", "interviewLLMGeneration"]) {
            const entries = orgUsage[phase];
            if (!Array.isArray(entries)) continue;
            for (const entry of entries) {
                if (!entry || typeof entry !== "object") continue;
                const inp = Number(entry.inputTokens || 0);
                const out = Number(entry.outputTokens || 0);
                aggregates[phase].inputTokens += inp;
                aggregates[phase].outputTokens += out;
                aggregates[phase].costUsd += inp * pricePerToken.input + out * pricePerToken.output;
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
