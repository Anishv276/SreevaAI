/**
 * app/api/super-admin/demo/extract/route.ts
 * ─────────────────────────────────────────
 * POST → Upload PDF for a DemoTemplate, extract JD text, store in DB.
 * Step 2 of the wizard.
 *
 * Runs inline using enqueueJdExtraction + polling the BullMQ worker result.
 * The jd-extraction worker now runs locally (no Modal), so this resolves fast.
 *
 * Body: FormData { templateId, jdFile }
 * Returns: { roleTitle: string, jdPreview: string }
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/prisma-demo";
import { getSession } from "@/lib/auth";
import { enqueueJdExtraction } from "@/lib/jd-extraction";
import { apiErrorResponse } from "@/lib/slack-error-logger";
import redisConnection, { getBullPrefix } from "@/lib/redis";
import { Queue } from "bullmq";
import { priceLlmUsage } from "@/lib/usage-metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const formData = await request.formData();
        const templateId = (formData.get("templateId") as string | null)?.trim();
        const file = formData.get("jdFile") as File | null;

        if (!templateId || !file) {
            return NextResponse.json({ error: "Missing templateId or jdFile" }, { status: 400 });
        }

        const template = await db.demoTemplate.findUnique({ where: { id: templateId } });
        if (!template) {
            return NextResponse.json({ error: "Template not found" }, { status: 404 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Enqueue the jd-extraction job (worker runs locally now — no Modal)
        const jdJobId = await enqueueJdExtraction({
            kind: "file",
            fileName: file.name,
            buffer,
            orgOpenAIModel: "gpt-4.1-mini",
        });

        // Poll for the worker result (local worker is fast — typically 5-15s)
        const jdQueue = new Queue("jd-extraction", {
            connection: redisConnection,
            prefix: getBullPrefix(),
        });

        let jdText = "";
        let roleTitle = template.title;
        let extracted: any = null;
        let usage: { model: string; inputTokens: number; outputTokens: number; cachedInputTokens: number } | null = null;

        for (let i = 0; i < 40; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const jdJob = await jdQueue.getJob(jdJobId).catch(() => null);
            if (!jdJob) continue;
            const state = await jdJob.getState();
            if (state === "completed") {
                const rv = jdJob.returnvalue || {};
                jdText = rv.text || "";
                extracted = rv.data || null;
                usage = rv.usage || null;
                roleTitle =
                    extracted?.job_title ||
                    extracted?.jobTitle ||
                    extracted?.title ||
                    template.title;
                break;
            }
            if (state === "failed") {
                await jdQueue.close();
                return NextResponse.json({ error: "JD extraction failed in worker" }, { status: 500 });
            }
        }
        await jdQueue.close();

        if (!jdText) {
            return NextResponse.json(
                { error: "JD extraction timed out. Please check the worker is running and retry." },
                { status: 408 }
            );
        }

        // This wizard step has no orgId (demo templates have no OrganizationDetails
        // row), so the jd-extraction worker's recordOrgBillingUsage never fires for
        // it -- the real OpenAI cost must be priced and persisted here instead,
        // same as the /demo/questions route's inline extractJdStructure fallback,
        // or it's silently dropped from DemoTemplate.usageJson entirely.
        const currentUsageJson = (template.usageJson as any) || {};
        let currentUsageCostUsd = template.usageCostUsd || 0;
        if (usage) {
            const jdEntry = await priceLlmUsage(usage);
            currentUsageCostUsd += jdEntry.costUsd;
            currentUsageJson.jdExtraction = { runs: 1, llm: [jdEntry] };
        }

        // Persist
        await db.demoTemplate.update({
            where: { id: templateId },
            data: {
                jdText,
                jdExtractedDetails: extracted ?? undefined,
                roleTitle: roleTitle || template.title,
                usageJson: currentUsageJson,
                usageCostUsd: currentUsageCostUsd,
            },
        });

        return NextResponse.json({
            roleTitle,
            jdPreview: jdText.slice(0, 300) + (jdText.length > 300 ? "…" : ""),
            jdExtractedDetails: extracted,
        });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/super-admin/demo/extract",
            method: "POST",
            error,
            body: { error: "Failed to extract JD" },
            status: 500,
            logLabel: "[DEMO/EXTRACT] error:",
        });
    }
}
