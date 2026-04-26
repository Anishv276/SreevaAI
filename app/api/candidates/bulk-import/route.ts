import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { recordOrgBillingUsage } from "@/lib/usage-metrics";
import { generateId } from "@/lib/ids";
import { safeJsonParse } from "@/lib/utils";

const CHUNK_SIZE = 5;

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const driveId = formData.get("driveId") as string;
        const files = formData.getAll("files") as File[];

        if (!driveId || !files.length) {
            return NextResponse.json(
                { error: "driveId and files are required" },
                { status: 400 }
            );
        }

        // Fetch drive & org
        const drive = await prisma.drive.findUnique({
            where: { id: driveId },
            include: { organization: true },
        });

        if (!drive) {
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
        }

        // Create BulkImport record
        const bulkImport = await prisma.bulkImport.create({
            data: {
                orgId: drive.orgId!,
                driveId,
                totalCount: files.length,
                status: "PROCESSING",
            },
        });

        // Trigger async processing
        processFilesAsync(bulkImport.id, driveId, files, drive.orgId!).catch((err) => {
            console.error(`[BULK IMPORT] Error in async processing: ${err.message}`);
        });

        return NextResponse.json({
            bulkImportId: bulkImport.id,
            totalCount: files.length,
        });

    } catch (error) {
        console.error("[BULK IMPORT] POST Error:", error);
        return NextResponse.json(
            { error: "Failed to start bulk import: " + (error as Error).message },
            { status: 500 }
        );
    }
}

async function processFilesAsync(
    bulkImportId: string,
    driveId: string,
    files: File[],
    orgId: string
) {
    try {
        const drive = await prisma.drive.findUnique({
            where: { id: driveId },
            include: { organization: true },
        });

        if (!drive) {
            await prisma.bulkImport.update({
                where: { id: bulkImportId },
                data: { status: "FAILED", errorMessage: "Drive not found" },
            });
            return;
        }

        // Fetch org's LLM config
        let orgOpenAIModel = "gpt-4o-mini";
        if (drive.orgId) {
            const orgConfig = await prisma.organization.findUnique({
                where: { id: drive.orgId },
                select: { llmProvider: true, llmModel: true },
            });
            if ((orgConfig?.llmProvider || "OPENAI") === "OPENAI" && orgConfig?.llmModel) {
                orgOpenAIModel = orgConfig.llmModel;
            }
        }

        const threshold = drive.screeningThreshold ?? 60;
        let processedCount = 0;
        let failedCount = 0;
        const createdApplicationIds: string[] = [];

        // Process in chunks of CHUNK_SIZE
        for (let i = 0; i < files.length; i += CHUNK_SIZE) {
            const chunk = files.slice(i, i + CHUNK_SIZE);

            // Process each file in parallel within chunk
            const results = await Promise.allSettled(
                chunk.map((file) =>
                    processResume(file, driveId, drive, threshold, orgOpenAIModel, orgId)
                )
            );

            // Update counts & track IDs
            for (const result of results) {
                if (result.status === "fulfilled" && result.value) {
                    processedCount++;
                    createdApplicationIds.push(result.value);
                } else {
                    failedCount++;
                    console.error(
                        `[BULK IMPORT] Resume processing failed:`,
                        result.status === "rejected" ? result.reason : "Unknown error"
                    );
                }
            }

            // Update progress
            await prisma.bulkImport.update({
                where: { id: bulkImportId },
                data: {
                    processedCount,
                    failedCount,
                    updatedAt: new Date(),
                },
            });

            console.log(
                `[BULK IMPORT] Chunk ${Math.floor(i / CHUNK_SIZE) + 1} done. Progress: ${processedCount}/${files.length}`
            );
        }

        // Finalize
        await prisma.bulkImport.update({
            where: { id: bulkImportId },
            data: {
                status: "COMPLETED",
                completedAt: new Date(),
            },
        });

        console.log(
            `[BULK IMPORT] Completed. Processed: ${processedCount}, Failed: ${failedCount}`
        );

    } catch (error) {
        console.error(`[BULK IMPORT] Fatal error:`, error);
        await prisma.bulkImport.update({
            where: { id: bulkImportId },
            data: {
                status: "FAILED",
                errorMessage: (error as Error).message,
            },
        }).catch(() => {});
    }
}

async function processResume(
    file: File,
    driveId: string,
    drive: any,
    threshold: number,
    orgOpenAIModel: string,
    orgId: string
): Promise<string | null> {
    try {
        // Read file buffer
        const buffer = await file.arrayBuffer();
        const tempFilePath = join(tmpdir(), `bulk_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
        await writeFile(tempFilePath, Buffer.from(buffer));

        // Extract text from PDF (using Python)
        const extractedText = await extractPdfText(tempFilePath);

        // Build scoring input
        const scoringInput = {
            resume: extractedText,
            jd: safeJsonParse(drive.extractedDetails, {}),
            resume_raw_text: extractedText,
            jd_raw_text: drive.description || "",
            threshold,
        };

        const tempInputPath = join(tmpdir(), `score_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
        await writeFile(tempInputPath, JSON.stringify(scoringInput));

        let aiResult: any = { score: 0, status: "Pending", reasoning: "Processing failed" };

        const pythonCmd = process.platform === "win32" ? "python" : "python3";
        const pythonProcess = spawn(pythonCmd, ["scripts/extract_pdf.py", tempInputPath, "SCORE", orgOpenAIModel]);

        let outputData = "";
        let errorData = "";

        await new Promise((resolve, reject) => {
            pythonProcess.stdout.on("data", (data) => (outputData += data.toString()));
            pythonProcess.stderr.on("data", (data) => (errorData += data.toString()));
            pythonProcess.on("close", (code) => {
                if (code !== 0) reject(new Error(errorData));
                else resolve(null);
            });
        });

        const parsed = JSON.parse(outputData);
        aiResult = parsed.data || parsed;

        // Record billing
        if (parsed?.usage) {
            await recordOrgBillingUsage({
                orgId,
                feature: "resumeExtraction",
                usage: {
                    model: parsed.usage.model || "gpt-4o",
                    inputTokens: parsed.usage.inputTokens || 0,
                    outputTokens: parsed.usage.outputTokens || 0,
                    cachedInputTokens: parsed.usage.cachedInputTokens || 0,
                },
            });
        }

        // Compute resume status
        const score: number = typeof aiResult.score === "number"
            ? aiResult.score
            : parseInt(aiResult.score || "0") || 0;
        const resumeStatus: "SHORTLISTED" | "REJECTED" = score >= threshold ? "SHORTLISTED" : "REJECTED";

        // Parse file name for full name
        const fileName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
        const [firstName, ...lastNameParts] = fileName.split(/[\s_-]+/).filter(Boolean);
        const fullName = [firstName, ...lastNameParts].join(" ") || "Bulk Import Candidate";

        // Create Application
        const application = await prisma.application.create({
            data: {
                id: generateId("app", file.name),
                driveId,
                fullName,
                email: `bulk-${Date.now()}@bulkimport.local`,
                phone: "N/A",
                resumeUrl: file.name,
                resumeText: extractedText,
                aiScore: score,
                aiReport: JSON.stringify(aiResult),
                resumeStatus,
                interviewStatus: resumeStatus === "SHORTLISTED" ? "pending" : "Not Qualified",
                hiringStatus: resumeStatus === "SHORTLISTED" ? "pending" : "Not Shortlisted",
            },
        });

        // Create interview if shortlisted
        if (resumeStatus === "SHORTLISTED") {
            await prisma.interview.create({
                data: {
                    id: generateId("int", fullName),
                    applicationId: application.id,
                    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
                    status: "PENDING",
                },
            });
        }

        // Cleanup temp files
        await unlink(tempFilePath).catch(() => {});
        await unlink(tempInputPath).catch(() => {});

        console.log(`[BULK IMPORT] Processed: ${fullName} (Score: ${score}/${threshold})`);
        return application.id;

    } catch (error) {
        console.error(`[BULK IMPORT] Resume processing failed for ${file.name}:`, error);
        return null;
    }
}

async function extractPdfText(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const pythonCmd = process.platform === "win32" ? "python" : "python3";
        const pythonProcess = spawn(pythonCmd, ["scripts/extract_pdf.py", filePath, "EXTRACT"]);

        let outputData = "";
        let errorData = "";

        pythonProcess.stdout.on("data", (data) => (outputData += data.toString()));
        pythonProcess.stderr.on("data", (data) => (errorData += data.toString()));
        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(`PDF extraction failed: ${errorData}`));
            } else {
                try {
                    const parsed = JSON.parse(outputData);
                    resolve(parsed.text || "");
                } catch (e) {
                    reject(new Error(`Failed to parse PDF extraction output`));
                }
            }
        });
    });
}

// GET for progress tracking
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const bulkImportId = searchParams.get("id");

        if (!bulkImportId) {
            return NextResponse.json(
                { error: "id parameter required" },
                { status: 400 }
            );
        }

        const bulkImport = await prisma.bulkImport.findUnique({
            where: { id: bulkImportId },
        });

        if (!bulkImport) {
            return NextResponse.json({ error: "BulkImport not found" }, { status: 404 });
        }

        return NextResponse.json(bulkImport);

    } catch (error) {
        console.error("[BULK IMPORT] GET Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch bulk import status" },
            { status: 500 }
        );
    }
}
