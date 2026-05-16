import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { safeJsonParse } from "@/lib/utils";
import { getPythonExecutable } from "@/lib/python-exec";

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { id } = await params;

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
                        orgId: true,
                    }
                }
            }
        });

        if (!application) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }

        const drive = application.drive;
        const jdText = drive.description?.trim();

        if (!jdText) {
            return NextResponse.json({ 
                error: "Job Description is missing. Cannot re-scan." 
            }, { status: 400 });
        }

        let resumeText = application.resumeText || "";
        if (!resumeText && application.aiReport) {
            try {
                const report = JSON.parse(application.aiReport);
                resumeText = report.text || "";
            } catch {}
        }

        if (!resumeText) {
            return NextResponse.json({ error: "No resume text found to scan. Please re-upload resume." }, { status: 400 });
        }

        // Step 1: Re-extract the resume using the current prompt (picks up all prompt fixes).
        // Writing resumeText to a .txt file so the Python script processes it as plain text.
        const tempResumePath = join(tmpdir(), `rescan_resume_${id}_${Date.now()}.txt`);
        await writeFile(tempResumePath, resumeText);

        let structuredResume: Record<string, any> = {};
        try {
            const extractResult = await new Promise<any>((resolve, reject) => {
                let out = "", err = "";
                const proc = spawn(getPythonExecutable(), [
                    "scripts/extract_pdf.py", tempResumePath, "RESUME", "gpt-5.4-mini"
                ]);
                proc.stdout.on("data", (d) => { out += d.toString(); });
                proc.stderr.on("data", (d) => { err += d.toString(); });
                proc.on("close", (code) => {
                    if (code !== 0) reject(new Error(err || `RESUME extraction exited ${code}`));
                    else {
                        try { resolve(JSON.parse(out)); }
                        catch (e) { reject(new Error("Failed to parse RESUME extraction output")); }
                    }
                });
            });
            structuredResume = extractResult?.data || extractResult || {};
        } finally {
            await unlink(tempResumePath).catch(() => {});
        }

        const driveRows = await prisma.$queryRawUnsafe<Array<{ extractedDetails: string | null }>>(
            `
            SELECT "extractedDetails"
            FROM "Drive"
            WHERE id = $1
            LIMIT 1
            `,
            drive.id
        );

        const threshold = Number(drive.screeningThreshold ?? 60);
        const scoringInput = {
            resume: structuredResume,
            jd: safeJsonParse(driveRows?.[0]?.extractedDetails, {}),
            resume_raw_text: resumeText,
            jd_raw_text: jdText,
            threshold,
        };

        const tempInputPath = join(tmpdir(), `rescan_${id}_${Date.now()}.json`);
        await writeFile(tempInputPath, JSON.stringify(scoringInput));

        const pythonProcess = spawn(getPythonExecutable(), ["scripts/extract_pdf.py", tempInputPath, "SCORE", "gpt-4o-mini"]);

        let outputData = "";
        let errorData = "";

        await new Promise((resolve, reject) => {
            pythonProcess.stdout.on("data", (data) => (outputData += data.toString()));
            pythonProcess.stderr.on("data", (data) => (errorData += data.toString()));
            pythonProcess.on("close", (code) => {
                if (code !== 0) reject(new Error(errorData || `Python exited with code ${code}`));
                else resolve(null);
            });
        });

        await unlink(tempInputPath).catch(() => {});

        const parsed = JSON.parse(outputData);
        const aiResult = parsed.data || parsed;
        const score: number = typeof aiResult.score === "number" ? aiResult.score : parseInt(aiResult.score || "0") || 0;
        const resumeStatus: "SHORTLISTED" | "REJECTED" = score >= threshold ? "SHORTLISTED" : "REJECTED";

        const updated = await prisma.application.update({
            where: { id },
            data: {
                resumeStatus,
                aiScore: score,
                aiReport: JSON.stringify(aiResult),
                // Persist fresh structured resume so future rescans skip re-extraction
                resumeData: JSON.stringify({ structured: structuredResume }),
                ...(resumeStatus === "REJECTED" && {
                    interviewStatus: "Not Qualified",
                    hiringStatus: "Not Shortlisted",
                }),
            },
        });

        return NextResponse.json({
            message: "Rescan completed successfully",
            application: updated,
        });
    } catch (error) {
        console.error("Error triggering rescan:", error);
        return NextResponse.json({ error: "Failed to trigger rescan" }, { status: 500 });
    }
}
