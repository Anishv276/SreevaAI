/**
 * app/api/super-admin/demo/questions/route.ts
 * ─────────────────────────────────────────────
 * POST → Generate 5 questions for a DemoTemplate from its stored jdText.
 *
 * The real job pipeline reads structured jdExtractedDetails directly from DB.
 * The demo template only stores raw jdText, so we first run a quick structure
 * extraction (same extractJdStructure helper used by the JD upload pipeline),
 * then call generateQuestions with the structured result.
 *
 * - Capped at 5 questions for demo brevity
 * - Reads/writes DemoTemplate instead of Job
 * - No billing (demo cost tracked on DemoTemplate.usageJson separately)
 *
 * Body: { templateId, level, interviewType, roleTitle, voiceId }
 * Returns: { questions: BankQuestion[] }
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/prisma-demo";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";
import { extractJdStructure } from "@/lib/jd-structure-extraction";
import { generateQuestions } from "@/lib/question-bank/question-generation";
import { priceLlmUsage } from "@/lib/usage-metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const body = await request.json();
        const { templateId, level = 2, interviewType = "tech", roleTitle, voiceId, numQuestions = 5 } = body;

        if (!templateId) {
            return NextResponse.json({ error: "Missing templateId" }, { status: 400 });
        }

        const template = await db.demoTemplate.findUnique({ where: { id: templateId } });
        if (!template) {
            return NextResponse.json({ error: "Template not found" }, { status: 404 });
        }
        if (!template.jdText?.trim()) {
            return NextResponse.json(
                { error: "No JD text found on template — upload and extract a JD first." },
                { status: 400 }
            );
        }

        const model = "gpt-4.1-mini";
        const resolvedInterviewType = interviewType === "conversational" ? "conversational" : "tech";

        // Use stored jdExtractedDetails from Step 2, fallback to extractJdStructure if missing
        let jdExtractedDetails = template.jdExtractedDetails;
        let currentUsageJson = (template.usageJson as any) || {};
        let currentUsageCostUsd = template.usageCostUsd || 0;

        if (!jdExtractedDetails || typeof jdExtractedDetails !== "object") {
            const res = await extractJdStructure(template.jdText, model);
            jdExtractedDetails = res.data;
            
            const jdCost = await priceLlmUsage(res.usage);
            currentUsageCostUsd += jdCost;
            currentUsageJson.jdExtraction = {
                runs: 1,
                llm: [{ provider: "openai", model: res.usage.model, calls: 1, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, cachedInputTokens: res.usage.cachedInputTokens, costUsd: jdCost }]
            };

            await db.demoTemplate.update({
                where: { id: templateId },
                data: { jdExtractedDetails, usageJson: currentUsageJson, usageCostUsd: currentUsageCostUsd },
            });
        }

        // Single call: generate questions directly from structured JD data
        const validated = await generateQuestions(jdExtractedDetails, level, model, resolvedInterviewType, numQuestions);

        const qCost = await priceLlmUsage(validated.usage as any);
        currentUsageCostUsd += qCost;
        currentUsageJson.questionBank = {
            runs: 1,
            llm: [{ provider: "openai", model: (validated.usage as any).model, calls: 1, inputTokens: (validated.usage as any).inputTokens, outputTokens: (validated.usage as any).outputTokens, cachedInputTokens: (validated.usage as any).cachedInputTokens, costUsd: qCost }]
        };

        // Cap at the requested number of questions for demo brevity
        const selectedQuestions = validated.questions.slice(0, numQuestions);

        const questionBankSnapshot = {
            version: 1,
            level,
            generatedAt: new Date().toISOString(),
            questions: selectedQuestions,
        };

        // Update DemoTemplate with config + snapshot
        const updatedMode = resolvedInterviewType === "conversational" ? "CONVERSATION" : "TECH";
        await db.demoTemplate.update({
            where: { id: templateId },
            data: {
                questionBankSnapshot,
                usageJson: currentUsageJson,
                usageCostUsd: currentUsageCostUsd,
                level,
                interviewType: resolvedInterviewType,
                voiceId: voiceId || null,
                roleTitle: roleTitle?.trim() || template.roleTitle,
                mode: updatedMode,
                // Keep status as "processing" — wizard will set "ready" after user confirms
            },
        });

        return NextResponse.json({ questions: selectedQuestions });
    } catch (error: any) {
        return apiErrorResponse({
            route: "/api/super-admin/demo/questions",
            method: "POST",
            error,
            body: { error: "Failed to generate demo questions" },
            status: 500,
            logLabel: "[DEMO/QUESTIONS] error:",
        });
    }
}
