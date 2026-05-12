import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { recordOrgBillingUsage } from "@/lib/usage-metrics";
import { safeJsonParse } from "@/lib/utils";
import { generateId } from "@/lib/ids";
import { parseDriveScreeningSettings } from "@/lib/screening-criteria";
import { getOrgBillingStatus } from "@/lib/credits";
import { getInterviewQuotaSupportMessage } from "@/lib/interview-quota";
import { appendCandidateActivity } from "@/lib/candidate-activity";
import { getPythonExecutable } from "@/lib/python-exec";

const CHUNK_SIZE = 5;

// ── Helpers ────────────────────────────────────────────────────────────────

function runPython(args: string[], timeoutMs = 180000): Promise<string> {
    return new Promise((resolve, reject) => {
        let out = "", err = "";
        const p = spawn(getPythonExecutable(), args);
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

/** Structured JD must include must-have skills or deterministic scoring degenerates (empty list → keyword fallback ~20/45). */
function structuredJdHasMustHaves(jd: Record<string, any>): boolean {
    const mh = jd?.skills?.must_have;
    return Array.isArray(mh) && mh.length > 0;
}

/** Full JD text for scoring + GPT narrative — not just `description`. */
function buildJdRawText(d: {
    title?: string | null;
    role?: string | null;
    description?: string | null;
    responsibilities?: string | null;
    requirements?: string | null;
    skills?: string | null;
    experience?: string | null;
}): string {
    const parts: string[] = [];
    if (d.title?.trim()) parts.push(`Title: ${d.title.trim()}`);
    if (d.role?.trim()) parts.push(`Role: ${d.role.trim()}`);
    if (d.description?.trim()) parts.push(d.description.trim());
    if (d.responsibilities?.trim()) parts.push(`Responsibilities:\n${d.responsibilities.trim()}`);
    if (d.requirements?.trim()) parts.push(`Requirements:\n${d.requirements.trim()}`);
    if (d.skills?.trim()) parts.push(`Skills:\n${d.skills.trim()}`);
    if (d.experience?.trim()) parts.push(`Experience:\n${d.experience.trim()}`);
    return parts.join("\n\n").trim();
}

async function extractJDStructuredFromText(
    jdRawText: string,
    model: string
): Promise<{ data: Record<string, any>; usage: any }> {
    const tmpTxt = join(tmpdir(), `jd_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
    try {
        await writeFile(tmpTxt, jdRawText, "utf-8");
        const raw = await runPython(["scripts/extract_pdf.py", tmpTxt, "JD", model]);
        const parsed = JSON.parse(raw);
        if (parsed.error) throw new Error(parsed.error);
        return {
            data: parsed.data || {},
            usage: parsed.usage || {},
        };
    } finally {
        await unlink(tmpTxt).catch(() => {});
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
                screeningCriteria: true,
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

        const billingStatus = await getOrgBillingStatus(drive.orgId);
        if (billingStatus.interviewQuotaTotal > 0 && !billingStatus.hasSufficientInterviews) {
            return NextResponse.json(
                {
                    error: getInterviewQuotaSupportMessage("interviews"),
                    code: "NO_INTERVIEWS",
                },
                { status: 402 }
            );
        }

        const batch = await prisma.resumeBatch.create({
            data: {
                driveId,
                orgId: drive.orgId,
                totalCount: files.length,
                status: "PROCESSING",
            },
        });

        // Create placeholder records for immediate table feedback
        const placeholders = await Promise.all(
            files.map(async (file) => {
                const extractedName = file.name.replace(/\.[^/.]+$/, "").replace(/[_\-]+/g, " ").trim() || "Unknown";
                const appId = generateId("app", extractedName || file.name);
                
                const screeningCandidate = await prisma.resumeCandidate.create({
                    data: {
                        driveId,
                        bulkBatchId: batch.id,
                        fullName: extractedName,
                        fileName: file.name,
                        resumeStatus: "PROCESSING",
                        aiScore: 0,
                    },
                });

                const app = await prisma.application.create({
                    data: {
                        id: appId,
                        fullName: extractedName,
                        email: "",
                        phone: "",
                        resumeUrl: `/api/drives/${driveId}/resume-screening/download?candidateId=${screeningCandidate.id}`,
                        aiScore: 0,
                        driveId,
                        resumeStatus: "processing",
                        interviewStatus: "pending",
                        hiringStatus: "pending",
                    },
                });

                return { file, screeningCandidateId: screeningCandidate.id, appId: app.id };
            })
        );

        // Fire-and-forget
        processBatch(batch.id, driveId, placeholders, drive).catch((err) =>
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
    items: { file: File; screeningCandidateId: string; appId: string }[],
    drive: any
) {
    let processedCount = 0;
    let failedCount = 0;

    try {
        // Resume EXTRACTION uses gpt-5.4-mini; scoring/report uses gpt-4o
        const extractModel = "gpt-5.4-mini";
        const reportModel = "gpt-4o";


        const parsed = parseDriveScreeningSettings(
            drive.screeningCriteria,
            Number(drive.screeningThreshold ?? 60)
        );
        const threshold: number = Number(parsed.threshold ?? drive.screeningThreshold ?? 60);
        const screeningCriteria = parsed.criteria;

        const fullDrive = await prisma.drive.findUnique({
            where: { id: driveId },
            select: {
                extractedDetails: true,
                description: true,
                responsibilities: true,
                requirements: true,
                skills: true,
                experience: true,
                role: true,
                title: true,
            },
        });
        if (!fullDrive) {
            throw new Error(`Drive ${driveId} not found`);
        }

        let structuredJD = safeJsonParse<Record<string, any>>(fullDrive.extractedDetails, {});
        const jdRawText = buildJdRawText(fullDrive);

        if (!structuredJdHasMustHaves(structuredJD) && jdRawText.length >= 80) {
            console.warn(
                "[RESUME-SCREENING] No JD must-haves in extractedDetails — extracting structured JD from full drive text"
            );
            try {
                const { data: extractedJd, usage: jdUsage } = await extractJDStructuredFromText(
                    jdRawText,
                    extractModel
                );
                if (structuredJdHasMustHaves(extractedJd)) {
                    structuredJD = extractedJd;
                    await prisma.drive
                        .update({
                            where: { id: driveId },
                            data: { extractedDetails: JSON.stringify(extractedJd) },
                        })
                        .catch((e) =>
                            console.warn("[RESUME-SCREENING] Could not persist extractedDetails:", e)
                        );
                    if ((jdUsage?.inputTokens || jdUsage?.outputTokens) && drive.orgId) {
                        await recordOrgBillingUsage({
                            orgId: drive.orgId,
                            feature: "resumeExtraction",
                            usage: {
                                model: jdUsage?.model || extractModel,
                                inputTokens: jdUsage?.inputTokens || 0,
                                outputTokens: jdUsage?.outputTokens || 0,
                                cachedInputTokens: jdUsage?.cachedInputTokens || 0,
                            },
                        }).catch(() => {});
                    }
                }
            } catch (e) {
                console.error("[RESUME-SCREENING] JD extraction fallback failed:", e);
            }
        }

        if (!structuredJdHasMustHaves(structuredJD)) {
            console.warn(
                "[RESUME-SCREENING] Structured JD still lacks must-haves — skill scores use sparse-keyword fallback only"
            );
        }

        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
            const chunk = items.slice(i, i + CHUNK_SIZE);

            const results = await Promise.allSettled(
                chunk.map((item) =>
                    processOneResume(
                        item.file,
                        item.screeningCandidateId,
                        item.appId,
                        driveId,
                        batchId,
                        structuredJD,
                        jdRawText,
                        threshold,
                        extractModel,
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
                `[RESUME-SCREENING] chunk done — ${processedCount}/${items.length}`
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
    screeningCandidateId: string,
    appId: string,
    driveId: string,
    batchId: string,
    structuredJD: Record<string, any>,
    jdRawText: string,
    threshold: number,
    extractModel: string,
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
            await extractResume(tmpPdf, extractModel);

        // Record extraction billing
        if (extractUsage?.inputTokens || extractUsage?.outputTokens) {
            await recordOrgBillingUsage({
                orgId,
                feature: "resumeExtraction",
                usage: {
                    model: extractUsage.model || extractModel,
                    inputTokens: extractUsage.inputTokens || 0,
                    outputTokens: extractUsage.outputTokens || 0,
                    cachedInputTokens: extractUsage.cachedInputTokens || 0,
                },
            }).catch(() => {});
        }

        // ── Step 1.5: Mark 50% progress ──
        await prisma.resumeCandidate.update({
            where: { id: screeningCandidateId },
            data: { aiScore: 50 },
        }).catch(() => {});
        await prisma.application.update({
            where: { id: appId },
            data: { aiScore: 50 },
        }).catch(() => {});

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
                    model: scoreUsage.model || reportModel,
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
        await prisma.resumeCandidate.update({
            where: { id: screeningCandidateId },
            data: {
                fullName: extractedName,
                email: structuredResume?.email || null,
                phone: structuredResume?.phone || null,
                resumeText: resumeRawText,
                aiScore: score,
                aiReport: JSON.stringify(aiResult),
                resumeData: JSON.stringify(structuredResume),
                resumeStatus,
            },
        });

        await prisma.application.update({
            where: { id: appId },
            data: {
                fullName: extractedName,
                email: structuredResume?.email || "",
                phone: structuredResume?.phone || "",
                aiScore: score,
                aiReport: JSON.stringify(aiResult),
                resumeData: JSON.stringify(structuredResume),
                resumeText: resumeRawText,
                resumeStatus: resumeStatus.toLowerCase(),
            },
        });

        await appendCandidateActivity(screeningCandidateId, {
            type: "resume_screened",
            label: resumeStatus === "SHORTLISTED" ? "Resume shortlisted" : "Resume rejected",
            details: `AI score ${score} vs threshold ${threshold}`,
            timestamp: new Date().toISOString(),
            source: "system",
        });

        console.log(
            `[RESUME-SCREENING] ${extractedName} — score:${score} status:${resumeStatus}`
        );
    } catch (err) {
        // Mark as failed if an error occurs
        await prisma.resumeCandidate.update({
            where: { id: screeningCandidateId },
            data: { resumeStatus: "FAILED" },
        }).catch(() => {});
        await prisma.application.update({
            where: { id: appId },
            data: { resumeStatus: "failed" },
        }).catch(() => {});
        throw err;
    } finally {
        await unlink(tmpPdf).catch(() => {});
    }
}
