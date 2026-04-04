import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gradingQueue } from "@/lib/queue";
import { assessmentSubmitSchema } from "@/lib/validation";


export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        const result = assessmentSubmitSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { responses, proctoringData } = result.data;

        const assessment = await prisma.assessment.findUnique({
            where: { id },
            include: {
                questions: { orderBy: { order: "asc" } },
                application: {
                    include: {
                        drive: { select: { description: true } }
                    }
                }
            }
        });

        if (!assessment || assessment.completedAt) {
            return NextResponse.json({ error: "Assessment invalid or already completed" }, { status: 403 });
        }

        await prisma.assessmentResponse.createMany({
            data: responses.map((r) => ({
                assessmentId: id,
                questionId: r.questionId,
                answer: r.answer,
            }))
        });

        await prisma.assessment.update({
            where: { id },
            data: {
                completedAt: new Date(),
                status: "COMPLETED",
                tabSwitchCount: proctoringData?.tabSwitchCount || 0,
                suspiciousFlags: JSON.stringify(proctoringData?.flags || [])
            }
        });

        const startedAt = assessment.startedAt;
        const completedAt = new Date();
        const qaInputs = assessment.questions.map((q: any) => {
            const response = responses.find((r) => r.questionId === q.id);
            return {
                text: q.text,
                type: q.type,
                correctAnswer: q.correctAnswer || undefined,
                options: q.options ? JSON.parse(q.options) : undefined,
                answer: response?.answer || "",
            };
        });

        await gradingQueue.add('grade-submission', {
            assessmentId: id,
            questions: qaInputs,
            startedAt,
            completedAt,
            jdText: assessment.application?.drive?.description || ""
        }, {
            jobId: id,
            attempts: 5,
            backoff: { type: 'exponential', delay: 2000 }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("[ASSESSMENT SUBMIT ERROR]:", error);
        return NextResponse.json({ error: "Failed to submit assessment" }, { status: 500 });
    }
}
