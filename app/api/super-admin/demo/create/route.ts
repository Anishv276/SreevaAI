/**
 * app/api/super-admin/demo/create/route.ts
 * ─────────────────────────────────────────
 * POST → Upload JD PDF + mode → create DemoTemplate → enqueue extraction + brief
 *
 * Flow:
 *  1. Super Admin uploads JD PDF + mode ("TECH" | "CONVERSATION") + title
 *  2. We create a DemoTemplate row with status = "processing"
 *  3. We enqueue the JD text into the existing jd-extraction BullMQ queue
 *  4. After extraction, the worker will update jdText + kick off brief generation
 *     (handled via the demo-brief-generation queue added in queue.ts)
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/prisma-demo";
import { getSession } from "@/lib/auth";
import { enqueueJdExtraction } from "@/lib/jd-extraction";
import { demoBriefGenerationQueue } from "@/lib/queue";
import { apiErrorResponse } from "@/lib/slack-error-logger";

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const formData = await request.formData();
        const file = formData.get("jdFile") as File | null;
        const title = (formData.get("title") as string | null)?.trim();
        const roleTitle = (formData.get("roleTitle") as string | null)?.trim() || title;
        const mode = (formData.get("mode") as string | null)?.toUpperCase();

        if (!file || !title || !mode) {
            return NextResponse.json({ error: "Missing required fields: jdFile, title, mode" }, { status: 400 });
        }
        if (mode !== "TECH" && mode !== "CONVERSATION") {
            return NextResponse.json({ error: "mode must be TECH or CONVERSATION" }, { status: 400 });
        }

        // Read file bytes and convert to a buffer the worker understands
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 1. Create the DemoTemplate row immediately so the Super Admin sees it
        const template = await db.demoTemplate.create({
            data: {
                title,
                roleTitle: roleTitle || title,
                mode,
                status: "processing",
            },
        });

        // 2. Enqueue JD extraction (re-uses the existing worker — no Modal)
        //    No orgId: demo templates have no real OrganizationDetails row, and
        //    UsageEvent.organizationId is a required FK -- passing a fake
        //    namespaced string here used to silently fail that FK constraint
        //    inside EntityLedger.upsert every time. Cost is instead captured via
        //    DemoTemplate.usageJson (see worker.ts's jd-extraction/demo-brief-
        //    generation handlers), which has no such FK.
        const jdJobId = await enqueueJdExtraction({
            kind: "file",
            fileName: file.name,
            buffer: { type: "Buffer", data: Array.from(buffer) },
            orgOpenAIModel: "gpt-4.1-mini", // lightweight model for extraction
        });

        // 3. Enqueue brief generation — this will wait for the JD extraction result
        //    and then call the LLM to generate 8 topics based on mode
        await demoBriefGenerationQueue.add("generate-demo-brief", {
            templateId: template.id,
            jdExtractionJobId: jdJobId,
            mode,
            roleTitle: roleTitle || title,
        });

        return NextResponse.json({ template });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/super-admin/demo/create",
            method: "POST",
            error,
            body: { error: "Failed to create demo template" },
            status: 500,
            logLabel: "[DEMO/CREATE] error:",
        });
    }
}
