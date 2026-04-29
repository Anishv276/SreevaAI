import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { recordOrgBillingUsage } from "@/lib/usage-metrics";
import { generateId } from "@/lib/ids";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { safeJsonParse } from "@/lib/utils";

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
                aiReport: true,
                drive: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        screeningThreshold: true,
                        shortlistMode: true,
                        extractedDetails: true,
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
        let resumeText = (application as any).resumeText || "";

        if (!resumeText && application.aiReport) {
            try {
                const report = JSON.parse(application.aiReport);
                resumeText = report.text || "";
            } catch (e) {}
        }

        if (!resumeText) {
            return NextResponse.json({ error: "No resume text found to scan. Please re-upload resume." }, { status: 400 });
        }

        // 3. Build scoring input - pass threshold so Python's report reflects what we decided
        const screeningCriteria = safeJsonParse((application.drive as any).screeningCriteria, {});
        const threshold = Number((screeningCriteria as any)?.threshold ?? application.drive.screeningThreshold ?? 0);
        const scoringInput = {
            resume: safeJsonParse((application as any).structuredResume, {}),
            jd: safeJsonParse(application.drive.extractedDetails, {}),
            resume_raw_text: resumeText,
            jd_raw_text: application.drive.description || "",
            threshold,
        };

        const tempInputPath = join(tmpdir(), `rescan_${Date.now()}.json`);
        await writeFile(tempInputPath, JSON.stringify(scoringInput));

        let aiResult: any = { score: 0, status: "Pending", reasoning: "Processing failed" };

        const pythonCmd = process.platform === "win32" ? "python" : "python3";
        const reportModel = "gpt-4o";
        console.log(`[AI RE-SCAN] Executing for ${application.email} | threshold=${threshold}`);

        const pythonProcess = spawn(pythonCmd, ["scripts/extract_pdf.py", tempInputPath, "SCORE", reportModel]);

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

        const parsed = JSON.parse(outputData);
        aiResult = parsed.data || parsed;
        if (application.drive.orgId && parsed?.usage) {
            await recordOrgBillingUsage({
                orgId: application.drive.orgId,
                feature: "resumeReport",
                usage: {
                    model: parsed.usage.model || reportModel,
                    inputTokens: parsed.usage.inputTokens || 0,
                    outputTokens: parsed.usage.outputTokens || 0,
                    cachedInputTokens: parsed.usage.cachedInputTokens || 0,
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

        // 6. Email & interview invite (only in automatic mode)
        const isAutomatic = (((screeningCriteria as any)?.shortlistMode) || (application.drive as any).shortlistMode || "automatic") === "automatic";

        if (resumeStatus === "SHORTLISTED") {
                const interview = await (prisma as any).interview.upsert({
                    where: { applicationId: id },
                    update: {
                        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
                        status: "PENDING",
                    },
                    create: {
                        id: generateId("int", application?.fullName || id),
                        applicationId: id,
                        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
                        status: "PENDING",
                    },
                });

            if (isAutomatic) {
                const { sendApplicationStatusEmail } = await import("@/lib/mail");
                const interviewBase = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/interview/${id}`;
                const interviewLink = isInterviewTokenRequired()
                    ? `${interviewBase}?token=${interview.accessToken}`
                    : interviewBase;
                await sendApplicationStatusEmail({
                    email: application.email,
                    fullName: application.fullName,
                    jobTitle: application.drive.title,
                    orgId: application.drive.orgId ?? undefined,
                    status: resumeStatus,
                    score,
                    interviewLink,
                }).catch((err) => console.error("[SCAN API] Email trigger failed:", err));
            }
        } else if (isAutomatic) {
            const { sendApplicationStatusEmail } = await import("@/lib/mail");
            await sendApplicationStatusEmail({
                email: application.email,
                fullName: application.fullName,
                jobTitle: application.drive.title,
                orgId: application.drive.orgId ?? undefined,
                status: "REJECTED",
                score,
            }).catch((err) => console.error("[SCAN API] Email trigger failed:", err));
        }

        return NextResponse.json(updated);

    } catch (error) {
        console.error("Scan Error:", error);
        return NextResponse.json({ error: "Failed to scan resume: " + (error as Error).message }, { status: 500 });
    }
}
