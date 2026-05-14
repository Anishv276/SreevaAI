import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { recordOrgBillingUsage } from "@/lib/usage-metrics";
import { safeJsonParse } from "@/lib/utils";
import { parseDriveScreeningSettings } from "@/lib/screening-criteria";
import { appendCandidateActivity } from "@/lib/candidate-activity";
import { getPythonExecutable } from "@/lib/python-exec";

function extractStructuredResume(raw: unknown) {
    const parsed = safeJsonParse(raw, {});
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const obj = parsed as Record<string, any>;
    if (obj.structured && typeof obj.structured === "object" && !Array.isArray(obj.structured)) {
        return obj.structured;
    }
    if (obj.resume && typeof obj.resume === "object" && !Array.isArray(obj.resume)) {
        return obj.resume;
    }
    return obj;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        // 1. Fetch Application & Drive
        const application = await prisma.application.findUnique({
            where: { id },
            select: {
                id: true,
                fullName: true,
                email: true,
                resumeText: true,
                resumeData: true,
                aiReport: true,
                drive: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        screeningThreshold: true,
                        screeningCriteria: true,
                        orgId: true,
                    }
                }
            }
        });

        if (!application) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }

        if (!application.drive) {
            return NextResponse.json({ error: "Drive not found for this application" }, { status: 404 });
        }

        // 2. Get resume text
        let resumeText = application.resumeText || "";

        if (!resumeText && application.aiReport) {
            try {
                const report = JSON.parse(application.aiReport);
                resumeText = report.text || "";
            } catch (e) {}
        }

        if (!resumeText) {
            return NextResponse.json({ error: "No resume text found to scan. Please re-upload resume." }, { status: 400 });
        }

        const structuredResume = extractStructuredResume(application.resumeData);

        const driveRows = await prisma.$queryRawUnsafe<Array<{ extractedDetails: string | null }>>(
            `
            SELECT "extractedDetails"
            FROM "Drive"
            WHERE id = $1
            LIMIT 1
            `,
            application.drive.id
        );

        const screeningSettings = parseDriveScreeningSettings(
            application.drive.screeningCriteria,
            Number(application.drive.screeningThreshold ?? 0)
        );
        const threshold = Number(screeningSettings.threshold ?? application.drive.screeningThreshold ?? 0);
        const scoringInput = {
            resume: structuredResume,
            jd: safeJsonParse(driveRows?.[0]?.extractedDetails, {}),
            resume_raw_text: resumeText,
            jd_raw_text: application.drive.description || "",
            threshold,
            screening_criteria: screeningSettings.criteria,
        };

        const tempInputPath = join(tmpdir(), `rescan_${Date.now()}.json`);
        await writeFile(tempInputPath, JSON.stringify(scoringInput));

        let aiResult: any = { score: 0, status: "Pending", reasoning: "Processing failed" };

        const reportModel = "gpt-4o-mini";
        console.log(`[AI RE-SCAN] Executing for ${application.email} | threshold=${threshold}`);

        const pythonProcess = spawn(getPythonExecutable(), ["scripts/extract_pdf.py", tempInputPath, "SCORE", reportModel]);

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


        await unlink(tempInputPath).catch(() => {});

        const scoreResult = JSON.parse(outputData);
        aiResult = scoreResult.data || scoreResult;
        if (application.drive.orgId && scoreResult?.usage) {
            await recordOrgBillingUsage({
                orgId: application.drive.orgId,
                feature: "resumeReport",
                usage: {
                    model: scoreResult.usage.model || reportModel,
                    inputTokens: scoreResult.usage.inputTokens || 0,
                    outputTokens: scoreResult.usage.outputTokens || 0,
                    cachedInputTokens: scoreResult.usage.cachedInputTokens || 0,
                },
            });
        }

        // 4. DB threshold is the ONLY pass/fail criterion - Python's status is ignored
        const score: number = typeof aiResult.score === "number" ? aiResult.score : parseInt(aiResult.score || "0") || 0;
        const resumeStatus: "SHORTLISTED" | "REJECTED" = score >= threshold ? "SHORTLISTED" : "REJECTED";

        console.log(`[AI RE-SCAN] score=${score}, threshold=${threshold}, resumeStatus=${resumeStatus}`);

        // 5. Update DB
        const updated = await prisma.application.update({
            where: { id },
            data: {
                resumeStatus: resumeStatus,
                aiScore: score,
                aiReport: JSON.stringify(aiResult),
                ...(resumeStatus === "REJECTED" && {
                    interviewStatus: "Not Qualified",
                    hiringStatus: "Not Shortlisted",
                }),
            },
        });

        await appendCandidateActivity(id, {
            type: "resume_screened",
            label: resumeStatus === "SHORTLISTED" ? "Resume shortlisted" : "Resume rejected",
            details: `AI score ${score} vs threshold ${threshold}`,
            timestamp: new Date().toISOString(),
            source: "system",
        });

        return NextResponse.json(updated);

    } catch (error) {
        console.error("Scan Error:", error);
        return NextResponse.json({ error: "Failed to scan resume: " + (error as Error).message }, { status: 500 });
    }
}
