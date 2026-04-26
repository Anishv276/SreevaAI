import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { recordOrgBillingUsage } from "@/lib/usage-metrics";
import { safeJsonParse } from "@/lib/utils";

const CHUNK_SIZE = 5;

// POST /api/drives/[id]/resume-screening — start a batch
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: driveId } = await params;
        const formData = await request.formData();
        const files = formData.getAll("files") as File[];

        if (!files.length) return NextResponse.json({ error: "No files provided" }, { status: 400 });

        const drive = await prisma.drive.findUnique({
            where: { id: driveId },
            include: { organization: true },
        });
        if (!drive) return NextResponse.json({ error: "Drive not found" }, { status: 404 });

        const batch = await prisma.resumeBatch.create({
            data: {
                driveId,
                orgId: drive.orgId!,
                totalCount: files.length,
                status: "PROCESSING",
            },
        });

        // Fire-and-forget async processing
        processBatch(batch.id, driveId, files, drive).catch(err =>
            console.error("[RESUME-SCREENING] Fatal:", err)
        );

        return NextResponse.json({ batchId: batch.id, totalCount: files.length });
    } catch (err) {
        console.error("[RESUME-SCREENING] POST error:", err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

// GET /api/drives/[id]/resume-screening — list batches + candidates for drive
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: driveId } = await params;
        const { searchParams } = new URL(request.url);
        const batchId = searchParams.get("batchId");

        if (batchId) {
            // Poll single batch progress
            const batch = await prisma.resumeBatch.findUnique({ where: { id: batchId } });
            if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
            return NextResponse.json(batch);
        }

        // Return all batches + candidates for the drive
        const [batches, candidates] = await Promise.all([
            prisma.resumeBatch.findMany({
                where: { driveId },
                orderBy: { createdAt: "desc" },
                take: 20,
            }),
            prisma.resumeCandidate.findMany({
                where: { driveId },
                orderBy: { aiScore: "desc" },
            }),
        ]);

        return NextResponse.json({ batches, candidates });
    } catch (err) {
        console.error("[RESUME-SCREENING] GET error:", err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

// ── Async batch processor ──────────────────────────────────────────────────

async function processBatch(batchId: string, driveId: string, files: File[], drive: any) {
    let processedCount = 0;
    let failedCount = 0;

    try {
        let orgOpenAIModel = "gpt-4o-mini";
        if (drive.orgId) {
            const org = await prisma.organization.findUnique({
                where: { id: drive.orgId },
                select: { llmProvider: true, llmModel: true },
            });
            if ((org?.llmProvider || "OPENAI") === "OPENAI" && org?.llmModel) {
                orgOpenAIModel = org.llmModel;
            }
        }

        const threshold = drive.screeningThreshold ?? 60;

        for (let i = 0; i < files.length; i += CHUNK_SIZE) {
            const chunk = files.slice(i, i + CHUNK_SIZE);
            const results = await Promise.allSettled(
                chunk.map(f => processOneResume(f, driveId, batchId, drive, threshold, orgOpenAIModel, drive.orgId!))
            );
            for (const r of results) {
                if (r.status === "fulfilled") processedCount++;
                else { failedCount++; console.error("[RESUME-SCREENING] file failed:", r.reason); }
            }
            await prisma.resumeBatch.update({
                where: { id: batchId },
                data: { processedCount, failedCount },
            });
        }

        await prisma.resumeBatch.update({
            where: { id: batchId },
            data: { status: "COMPLETED", completedAt: new Date() },
        });
    } catch (err) {
        await prisma.resumeBatch.update({
            where: { id: batchId },
            data: { status: "FAILED" },
        }).catch(() => {});
    }
}

async function processOneResume(
    file: File, driveId: string, batchId: string,
    drive: any, threshold: number, model: string, orgId: string
): Promise<void> {
    const tmpPdf = join(tmpdir(), `rs_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
    const tmpJson = join(tmpdir(), `rs_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);

    try {
        await writeFile(tmpPdf, Buffer.from(await file.arrayBuffer()));

        const extractedText = await extractText(tmpPdf);

        const scoringInput = {
            resume: extractedText,
            jd: safeJsonParse(drive.extractedDetails, {}),
            resume_raw_text: extractedText,
            jd_raw_text: drive.description || "",
            threshold,
        };
        await writeFile(tmpJson, JSON.stringify(scoringInput));

        const pythonCmd = process.platform === "win32" ? "python" : "python3";
        let out = "", err = "";
        await new Promise<void>((res, rej) => {
            const p = spawn(pythonCmd, ["scripts/extract_pdf.py", tmpJson, "SCORE", model]);
            p.stdout.on("data", d => (out += d));
            p.stderr.on("data", d => (err += d));
            p.on("close", code => code !== 0 ? rej(new Error(err)) : res());
        });

        const parsed = JSON.parse(out);
        const aiResult = parsed.data || parsed;

        if (parsed?.usage) {
            await recordOrgBillingUsage({
                orgId, feature: "resumeExtraction",
                usage: {
                    model: parsed.usage.model || model,
                    inputTokens: parsed.usage.inputTokens || 0,
                    outputTokens: parsed.usage.outputTokens || 0,
                    cachedInputTokens: parsed.usage.cachedInputTokens || 0,
                },
            });
        }

        const score: number = typeof aiResult.score === "number"
            ? aiResult.score : parseInt(aiResult.score || "0") || 0;
        const resumeStatus = score >= threshold ? "SHORTLISTED" : "REJECTED";

        const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ");
        const fullName = baseName || "Unknown";

        await prisma.resumeCandidate.create({
            data: {
                driveId, bulkBatchId: batchId,
                fullName, fileName: file.name,
                resumeText: extractedText,
                aiScore: score,
                aiReport: JSON.stringify(aiResult),
                resumeStatus,
            },
        });
    } finally {
        await unlink(tmpPdf).catch(() => {});
        await unlink(tmpJson).catch(() => {});
    }
}

async function extractText(filePath: string): Promise<string> {
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    let out = "", err = "";
    await new Promise<void>((res, rej) => {
        const p = spawn(pythonCmd, ["scripts/extract_pdf.py", filePath, "EXTRACT"]);
        p.stdout.on("data", d => (out += d));
        p.stderr.on("data", d => (err += d));
        p.on("close", code => code !== 0 ? rej(new Error(err)) : res());
    });
    try { return JSON.parse(out).text || ""; } catch { return ""; }
}
