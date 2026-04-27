import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { recordOrgBillingUsage } from "@/lib/usage-metrics";
import { safeJsonParse } from "@/lib/utils";
import { generateId } from "@/lib/ids";

const CHUNK_SIZE = 5;
const pythonCmd = process.platform === "win32" ? "python" : "python3";

// ── Helpers ────────────────────────────────────────────────────────────────

function runPython(args: string[], timeoutMs = 180000): Promise<string> {
    return new Promise((resolve, reject) => {
        let out = "", err = "";
        const p = spawn(pythonCmd, args);
        const timer = setTimeout(() => {
            p.kill();
            reject(new Error(`python timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        p.stdout.on("data", (d) => (out += d.toString()));
        p.stderr.on("data", (d) => (err += d.toString()));
        p.on("close", (code) => {
            clearTimeout(timer);
            if (code !== 0) reject(new Error(err || `python exited ${code}`));
            else resolve(out);
        });
        p.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}

/**
 * Step 1 – Extract text + structured resume data from PDF.
 * Calls: python scripts/extract_pdf.py <pdf> RESUME [model]
 * Returns { text: string, data: object, usage: object }
 */
async function extractResume(
    pdfPath: string,
    model: string
): Promise<{ text: string; data: Record<string, any>; usage: any }> {
    const raw = await runPython(["scripts/extract_pdf.py", pdfPath, "RESUME", model]);
    const parsed = JSON.parse(raw);
    if (parsed.error) throw new Error(parsed.error);
    return {
        text: parsed.text || "",
        data: parsed.data || {},
        usage: parsed.usage || {},
    };
}

/**
 * Step 2 – Score the structured resume against the JD and screening criteria.
 * Calls: python scripts/extract_pdf.py <json_path> SCORE [model]
 * Input JSON: { resume: structuredData, jd: structuredJD,
 *               resume_raw_text, jd_raw_text, threshold, screening_criteria }
 * Returns { data: scoreReport, usage }
 */
async function scoreResume(
    structuredResume: Record<string, any>,
    structuredJD: Record<string, any>,
    resumeRawText: string,
    jdRawText: string,
    threshold: number,
    model: string,
    screeningCriteria?: Record<string, any>
): Promise<{ data: Record<string, any>; usage: any }> {
    const tmpJson = join(tmpdir(), `score_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    try {
        const payload: any = {
            resume: structuredResume,
            jd: structuredJD,
            resume_raw_text: resumeRawText,
            jd_raw_text: jdRawText,
            threshold,
        };
        if (screeningCriteria && Object.keys(screeningCriteria).length > 0) {
            payload.screening_criteria = screeningCriteria;
        }
        await writeFile(tmpJson, JSON.stringify(payload));
        const raw = await runPython(["scripts/extract_pdf.py", tmpJson, "SCORE", model]);
        const parsed = JSON.parse(raw);
        if (parsed.error) throw new Error(parsed.error);
        return {
            data: parsed.data || parsed,
            usage: parsed.usage || {},
        };
    } finally {
        await unlink(tmpJson).catch(() => {});
    }
}

// ── Routes ─────────────────────────────────────────────────────────────────

// POST /api/drives/[id]/resume-screening — start a batch
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: driveId } = await params;
        const formData = await request.formData();
        const files = formData.getAll("files") as File[];

        if (!files.length)
            return NextResponse.json({ error: "No files provided" }, { status: 400 });

        const drive = await prisma.drive.findUnique({
            where: { id: driveId },
            select: {
                id: true,
                title: true,
                description: true,
                screeningThreshold: true,
                shortlistMode: true,
                extractedDetails: true,
                orgId: true,
                organization: {
                    select: {
                        llmProvider: true,
                        llmModel: true,
                    },
                },
            },
        });
        if (!drive)
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
        if (!drive.orgId)
            return NextResponse.json({ error: "Drive has no organisation" }, { status: 400 });

        const batch = await prisma.resumeBatch.create({
            data: {
                driveId,
                orgId: drive.orgId,
                totalCount: files.length,
                status: "PROCESSING",
            },
        });

        // Fire-and-forget
        processBatch(batch.id, driveId, files, drive).catch((err) =>
            console.error("[RESUME-SCREENING] Fatal:", err)
        );

        return NextResponse.json({ batchId: batch.id, totalCount: files.length });
    } catch (err) {
        console.error("[RESUME-SCREENING] POST error:", err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

// GET /api/drives/[id]/resume-screening — poll batch OR fetch all
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: driveId } = await params;
        const { searchParams } = new URL(request.url);
        const batchId = searchParams.get("batchId");

        if (batchId) {
            const batch = await prisma.resumeBatch.findUnique({ where: { id: batchId } });
            if (!batch)
                return NextResponse.json({ error: "Batch not found" }, { status: 404 });
            return NextResponse.json(batch);
        }

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

// ── Batch processor ────────────────────────────────────────────────────────

async function processBatch(
    batchId: string,
    driveId: string,
    files: File[],
    drive: any
) {
    let processedCount = 0;
    let failedCount = 0;

    try {
        const orgModel = "gpt-5.4-mini";     // extraction step
        const reportModel = "gpt-4o";         // scoring/report step (gpt-4o, no override)


        const threshold: number = Number(drive.screeningThreshold ?? 60);
        // Parse the drive's extracted JD once — reuse for every resume
        const structuredJD = safeJsonParse(drive.extractedDetails, {});
        const jdRawText: string = drive.description || "";
        const screeningCriteria = {
            threshold,
            shortlistMode: drive.shortlistMode || "automatic",
        };

        for (let i = 0; i < files.length; i += CHUNK_SIZE) {
            const chunk = files.slice(i, i + CHUNK_SIZE);

            const results = await Promise.allSettled(
                chunk.map((file) =>
                    processOneResume(
                        file,
                        driveId,
                        batchId,
                        structuredJD,
                        jdRawText,
                        threshold,
                        orgModel,
                        reportModel,
                        drive.orgId!,
                        screeningCriteria
                    )
                )
            );

            for (const r of results) {
                if (r.status === "fulfilled") processedCount++;
                else {
                    failedCount++;
                    console.error("[RESUME-SCREENING] file failed:", r.reason);
                }
            }

            await prisma.resumeBatch.update({
                where: { id: batchId },
                data: { processedCount, failedCount },
            });

            console.log(
                `[RESUME-SCREENING] chunk done — ${processedCount}/${files.length}`
            );
        }

        await prisma.resumeBatch.update({
            where: { id: batchId },
            data: { status: "COMPLETED", completedAt: new Date() },
        });

        console.log(
            `[RESUME-SCREENING] batch ${batchId} complete — processed:${processedCount} failed:${failedCount}`
        );
    } catch (err) {
        console.error("[RESUME-SCREENING] processBatch error:", err);
        await prisma.resumeBatch.update({
            where: { id: batchId },
            data: {
                status: "FAILED",
                processedCount,
                failedCount,
            },
        }).catch(() => {});
    }
}

async function processOneResume(
    file: File,
    driveId: string,
    batchId: string,
    structuredJD: Record<string, any>,
    jdRawText: string,
    threshold: number,
    model: string,
    reportModel: string,
    orgId: string,
    screeningCriteria?: Record<string, any>
): Promise<void> {
    const tmpPdf = join(
        tmpdir(),
        `rs_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`
    );

    try {
        // Write PDF to temp disk
        await writeFile(tmpPdf, Buffer.from(await file.arrayBuffer()));

        // ── Step 1: Extract resume text + structured data ──
        const { text: resumeRawText, data: structuredResume, usage: extractUsage } =
            await extractResume(tmpPdf, model);

        // Record extraction billing
        if (extractUsage?.inputTokens || extractUsage?.outputTokens) {
            await recordOrgBillingUsage({
                orgId,
                feature: "resumeExtraction",
                usage: {
                    model: extractUsage.model || model,
                    inputTokens: extractUsage.inputTokens || 0,
                    outputTokens: extractUsage.outputTokens || 0,
                    cachedInputTokens: extractUsage.cachedInputTokens || 0,
                },
            }).catch(() => {});
        }

        // ── Step 2: Score against JD and screening criteria ──
        const { data: aiResult, usage: scoreUsage } = await scoreResume(
            structuredResume,
            structuredJD,
            resumeRawText,
            jdRawText,
            threshold,
            reportModel,
            screeningCriteria
        );

        // Record scoring billing
        if (scoreUsage?.inputTokens || scoreUsage?.outputTokens) {
            await recordOrgBillingUsage({
                orgId,
                feature: "resumeReport",
                usage: {
                    model: scoreUsage.model || model,
                    inputTokens: scoreUsage.inputTokens || 0,
                    outputTokens: scoreUsage.outputTokens || 0,
                    cachedInputTokens: scoreUsage.cachedInputTokens || 0,
                },
            }).catch(() => {});
        }

        // ── Compute final status ──
        const score: number =
            typeof aiResult.score === "number"
                ? aiResult.score
                : parseInt(String(aiResult.score || "0")) || 0;
        const resumeStatus = score >= threshold ? "SHORTLISTED" : "REJECTED";

        // Extract full_name from structured resume, fall back to filename
        const extractedName: string =
            structuredResume?.full_name ||
            file.name.replace(/\.[^/.]+$/, "").replace(/[_\-]+/g, " ").trim() ||
            "Unknown";

        // ── Persist ──
        const screeningCandidate = await prisma.resumeCandidate.create({
            data: {
                driveId,
                bulkBatchId: batchId,
                fullName: extractedName,
                email: structuredResume?.email || null,
                phone: structuredResume?.phone || null,
                fileName: file.name,
                resumeText: resumeRawText,
                aiScore: score,
                aiReport: JSON.stringify(aiResult),
                resumeStatus,
            },
        });

        await prisma.application.create({
            data: {
                id: generateId("app", extractedName || file.name),
                fullName: extractedName,
                email: structuredResume?.email || "",
                phone: structuredResume?.phone || "",
                resumeUrl: `/api/drives/${driveId}/resume-screening/download?candidateId=${screeningCandidate.id}`,
                aiScore: score,
                aiReport: JSON.stringify(aiResult),
                resumeText: resumeRawText,
                driveId,
                resumeStatus: resumeStatus.toLowerCase(),
                interviewStatus: "pending",
                hiringStatus: "pending",
            },
        });

        console.log(
            `[RESUME-SCREENING] ${extractedName} — score:${score} status:${resumeStatus}`
        );
    } finally {
        await unlink(tmpPdf).catch(() => {});
    }
}
