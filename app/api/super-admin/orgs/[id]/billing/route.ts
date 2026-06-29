import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/super-admin/orgs/[id]/billing - compute per-provider aggregates
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
        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        // Fetch all interviews for this org with their billing metrics
        const interviews = await prisma.$queryRaw<Array<{
            testBillingMetrics: Record<string, any> | null;
        }>>(
            Prisma.sql`
                SELECT i."testBillingMetrics"
                FROM "Interview" i
                JOIN "Application" a ON a.id = i."applicationId"
                JOIN "Drive" d ON d.id = a."driveId"
                WHERE d."orgId" = ${id}
                AND i."isDeleted" = false
                AND a."isDeleted" = false
                AND d."isDeleted" = false
            `
        );

        // Get org-level usage metrics for extraction phases
        const orgUsage = (org.usageMetrics && typeof org.usageMetrics === 'object')
            ? (org.usageMetrics as Record<string, any>)
            : {};

        // Aggregate by feature and provider
        const aggregates: Record<string, any> = {
            resumeExtraction: { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: "gpt-5.4-mini" },
            jdExtraction: { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: "gpt-5.4-mini" },
            interviewReport: { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: "gpt-5.4-mini" },
            resumeReport: { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, model: "gpt-5.4-mini" },
            interview: {
                runs: 0,
                inputTokens: 0,
                outputTokens: 0,
                costUsd: 0,
                ttsCharacters: 0,
                ttsCostUsd: 0,
                sttAudioSeconds: 0,
                sttCostUsd: 0,
                model: "gpt-4.1-mini",
                ttsProviders: {} as Record<string, { characters: number; costUsd: number }>,
                sttProviders: {} as Record<string, { seconds: number; costUsd: number }>,
            },
        };

        for (const interview of interviews) {
            const metrics = interview.testBillingMetrics as Record<string, any> || {};

            // Only count interviews where skipReport is false or not set
            if (!metrics.skipReport) {
                // Aggregate interview phase (only once per interview)
                aggregates.interview.runs += 1;
                aggregates.interview.inputTokens += metrics.llmInputTokens || 0;
                aggregates.interview.outputTokens += metrics.llmOutputTokens || 0;
                aggregates.interview.costUsd += metrics.llmCost || 0;

                // Aggregate TTS by provider
                const ttsChars = metrics.ttsChars || 0;
                const ttsCost = metrics.ttsCost || 0;
                const ttsProvider = (metrics.ttsProvider || "UNKNOWN").toUpperCase();
                if (ttsChars > 0 || ttsCost > 0) {
                    if (!aggregates.interview.ttsProviders[ttsProvider]) {
                        aggregates.interview.ttsProviders[ttsProvider] = { characters: 0, costUsd: 0 };
                    }
                    aggregates.interview.ttsProviders[ttsProvider].characters += ttsChars;
                    aggregates.interview.ttsProviders[ttsProvider].costUsd += ttsCost;
                    aggregates.interview.ttsCharacters += ttsChars;
                    aggregates.interview.ttsCostUsd += ttsCost;
                }

                // Aggregate STT by provider
                const sttSeconds = metrics.sttSeconds || 0;
                const sttCost = metrics.sttCost || 0;
                const sttProvider = (metrics.sttProvider || "deepgram").toLowerCase();
                if (sttSeconds > 0 || sttCost > 0) {
                    if (!aggregates.interview.sttProviders[sttProvider]) {
                        aggregates.interview.sttProviders[sttProvider] = { seconds: 0, costUsd: 0 };
                    }
                    aggregates.interview.sttProviders[sttProvider].seconds += sttSeconds;
                    aggregates.interview.sttProviders[sttProvider].costUsd += sttCost;
                    aggregates.interview.sttAudioSeconds += sttSeconds;
                    aggregates.interview.sttCostUsd += sttCost;
                }
            }
        }

        // Merge org-level extraction phase data
        const extractionPhases = ['resumeExtraction', 'jdExtraction', 'interviewReport', 'resumeReport'];
        for (const phase of extractionPhases) {
            const phaseData = orgUsage[phase];
            if (phaseData && typeof phaseData === 'object') {
                // Sum all billing entries for this phase (they're stored as an array of objects)
                if (Array.isArray(phaseData)) {
                    let totalCost = 0, totalInputTokens = 0, totalOutputTokens = 0, runs = 0;
                    for (const entry of phaseData) {
                        if (entry && typeof entry === 'object') {
                            const model = entry.model || '';
                            const inputTokens = Number(entry.inputTokens || 0);
                            const outputTokens = Number(entry.outputTokens || 0);
                            // Cost estimate: (input * 2.5 + output * 10) / 1M for GPT-4o
                            const cost = (inputTokens * 2.5 + outputTokens * 10) / 1_000_000;
                            totalCost += cost;
                            totalInputTokens += inputTokens;
                            totalOutputTokens += outputTokens;
                            runs = Math.max(runs, 1); // At least 1 run if data exists
                        }
                    }
                    if (totalCost > 0 || totalInputTokens > 0) {
                        aggregates[phase].runs = runs;
                        aggregates[phase].inputTokens = totalInputTokens;
                        aggregates[phase].outputTokens = totalOutputTokens;
                        aggregates[phase].costUsd = totalCost;
                    }
                }
            }
        }

        // Round costs to 2 decimals
        Object.keys(aggregates).forEach(key => {
            const feature = aggregates[key];
            if (feature.costUsd) feature.costUsd = Math.round(feature.costUsd * 100) / 100;
            if (feature.ttsCostUsd) feature.ttsCostUsd = Math.round(feature.ttsCostUsd * 100) / 100;
            if (feature.sttCostUsd) feature.sttCostUsd = Math.round(feature.sttCostUsd * 100) / 100;
            if (feature.ttsProviders) {
                Object.keys(feature.ttsProviders).forEach(provider => {
                    feature.ttsProviders[provider].costUsd = Math.round(feature.ttsProviders[provider].costUsd * 100) / 100;
                });
            }
            if (feature.sttProviders) {
                Object.keys(feature.sttProviders).forEach(provider => {
                    feature.sttProviders[provider].costUsd = Math.round(feature.sttProviders[provider].costUsd * 100) / 100;
                });
            }
        });

        return NextResponse.json(aggregates);
    } catch (error) {
        console.error("Error fetching org billing:", error);
        return NextResponse.json({ error: "Failed to fetch billing data" }, { status: 500 });
    }
}
