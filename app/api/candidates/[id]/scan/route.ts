
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        
        // 1. Fetch Application & Drive logic
        const application = await prisma.application.findUnique({
            where: { id },
            include: { drive: true }
        });

        if (!application) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }

        if (!application.drive) {
            return NextResponse.json({ error: "Drive not found for this application" }, { status: 404 });
        }

        // 2. We need resume text. 
        // If it's missing, we either need to extract it now from resumeUrl 
        // (but extraction usually happens on upload).
        // For now, let's assume the user wants to re-run scoring with whatever text we can get.
        
        let resumeText = (application as any).resumeText || "";
        
        // If missing, try extraction from URL if possible (requires downloading first)
        // For simplicity, let's look if we can find extracted text in aiReport if it was partially set
        if (!resumeText && application.aiReport) {
            try {
                const report = JSON.parse(application.aiReport);
                resumeText = report.text || "";
            } catch (e) {}
        }

        if (!resumeText) {
             // We can't score without text. In a real system, we'd download the PDF from resumeUrl here.
             // But let's try to be helpful - maybe use a placeholder if we really have nothing? 
             // Or fail with a clear message.
             return NextResponse.json({ error: "No resume text found to scan. Please re-upload resume." }, { status: 400 });
        }

        const jdText = application.drive.description;
        const scoringInput = { resume: resumeText, jd: jdText };

        const tempInputPath = join(tmpdir(), `rescan_${Date.now()}.json`);
        await writeFile(tempInputPath, JSON.stringify(scoringInput));

        let aiResult: any = { score: 0, status: "Pending", reasoning: "Processing failed" };

        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        console.log(`[AI RE-SCAN] Executing for ${application.email}`);
        
        const pythonProcess = spawn(pythonCmd, ["scripts/extract_pdf.py", tempInputPath, "SCORE"]);

        let outputData = "";
        let errorData = "";

        await new Promise((resolve, reject) => {
            pythonProcess.stdout.on("data", (data) => outputData += data.toString());
            pythonProcess.stderr.on("data", (data) => errorData += data.toString());
            pythonProcess.on("close", (code) => {
                if (code !== 0) reject(new Error(errorData));
                else resolve(null);
            });
        });

        console.log(`[AI RE-SCAN] Raw Output: ${outputData}`);
        const parsed = JSON.parse(outputData);
        aiResult = parsed.data || parsed;

        await unlink(tempInputPath).catch(() => {});

        // 3. Determine Selection & Send Email
        const score = aiResult.score || 0;
        const threshold = application.drive.screeningThreshold || 60;
        const finalStatus = score >= threshold ? 'ACCEPTED' : 'REJECTED';

        // Update Application with new score and final status
        const updated = await prisma.application.update({
            where: { id },
            data: {
                status: finalStatus,
                aiScore: score,
                aiReport: JSON.stringify(aiResult)
            }
        });

        // Trigger Automated Email & Assessment Generation
        const { sendApplicationStatusEmail } = await import("@/lib/mail");
        
        if (finalStatus === 'ACCEPTED') {
            // Generate Personalized Assessment
            const { generatePersonalizedAssessment } = await import("@/lib/ai-assessment");
            const questions = await generatePersonalizedAssessment({
                resumeData: application.resumeText || "",
                jdData: { description: application.drive.description, skills: {} },
                count: application.drive.assessmentCount,
                difficulty: application.drive.assessmentDifficulty,
                types: application.drive.assessmentTypes
            });

            // Create Assessment record and questions
            const assessment = await prisma.assessment.create({
                data: {
                    applicationId: id,
                    questions: {
                        create: questions.map((q, index) => ({
                            text: q.text,
                            type: q.type,
                            options: q.options ? JSON.stringify(q.options) : null,
                            correctAnswer: q.correctAnswer,
                            order: index
                        }))
                    }
                }
            });

            // Send email with assessment link
            const assessmentLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/careers/assess/${assessment.id}`;
            
            sendApplicationStatusEmail({
                email: application.email,
                fullName: application.fullName,
                jobTitle: application.drive.title,
                status: finalStatus,
                score: score,
                assessmentLink: assessmentLink
            }).catch(err => console.error("[SCAN API] Email trigger failed:", err));
        } else {
            sendApplicationStatusEmail({
                email: application.email,
                fullName: application.fullName,
                jobTitle: application.drive.title,
                status: finalStatus,
                score: score
            }).catch(err => console.error("[SCAN API] Email trigger failed:", err));
        }

        return NextResponse.json(updated);

    } catch (error) {
        console.error("Scan Error:", error);
        return NextResponse.json({ error: "Failed to scan resume: " + (error as Error).message }, { status: 500 });
    }
}
