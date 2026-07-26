import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";
import { extractSkills, TooFewSkillsError } from "@/lib/question-bank/skill-extraction";
import { decomposeSubtopics } from "@/lib/question-bank/subtopic-decomposition";
import { generateQuestions } from "@/lib/question-bank/question-generation";
import { buildJdTextFromExtractedDetails } from "@/lib/question-bank/jd-text";
import { LLMCallError } from "@/lib/openai-client";
import type { QuestionBank } from "@/lib/question-bank/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/jobs/[id]/generate-questions
 *
 * Synchronous "Start Generation" endpoint -- runs Call A (skill extraction)
 * -> Call B (subtopic decomposition) -> Call C (question generation)
 * sequentially, in-process, in this single request/response cycle. No
 * worker/queue/Modal involved. Never persists a partial/out-of-range
 * (15-20 question) bank.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    let jobId = "";
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { id } = await params;
        jobId = id;

        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: {
                organizationId: true,
                level: true,
                jdExtractedDetails: true,
                questionBankVersion: true,
                organization: { select: { llmJdExtraction: true } },
            },
        });
        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        const isSuperAdmin = session.role === "SUPER_ADMIN";
        if (!isSuperAdmin && job.organizationId !== session.orgId) {
            return NextResponse.json({ error: "Access Denied: Ownership required to generate questions" }, { status: 403 });
        }

        const level = job.level ?? 2;
        const jdText = buildJdTextFromExtractedDetails(job.jdExtractedDetails);
        if (!jdText.trim()) {
            return NextResponse.json(
                { error: "No job description text found on this job -- upload/extract a JD before generating questions." },
                { status: 400 }
            );
        }

        const model = job.organization?.llmJdExtraction || "gpt-5.4-mini";
        const isRegeneration = job.questionBankVersion > 0;

        await prisma.job.update({
            where: { id: jobId },
            data: {
                status: isRegeneration ? "REGENERATING" : "GENERATING",
                failureReason: null,
            },
        });

        // Call A -- skill extraction
        let skills;
        try {
            ({ skills } = await extractSkills(jdText, model));
        } catch (err) {
            if (err instanceof TooFewSkillsError) {
                await prisma.job.update({
                    where: { id: jobId },
                    data: { status: "FAILED", failureReason: err.message },
                });
                return NextResponse.json({ error: err.message, code: "JD_TOO_VAGUE" }, { status: 422 });
            }
            const message = err instanceof LLMCallError ? err.message : "Skill extraction failed";
            await prisma.job.update({
                where: { id: jobId },
                data: { status: "FAILED", failureReason: message },
            });
            return NextResponse.json({ error: message, code: "SKILL_EXTRACTION_FAILED" }, { status: 502 });
        }

        // Call B -- subtopic decomposition (consumes Call A's skill list)
        let skillSubtopics;
        try {
            ({ skillSubtopics } = await decomposeSubtopics(jdText, skills, model));
        } catch (err) {
            const message = err instanceof LLMCallError ? err.message : "Subtopic decomposition failed";
            await prisma.job.update({
                where: { id: jobId },
                data: { status: "FAILED", failureReason: message },
            });
            return NextResponse.json({ error: message, code: "SUBTOPIC_DECOMPOSITION_FAILED" }, { status: 502 });
        }

        // Call C -- question generation (consumes Call B's skill/subtopic map)
        let validated;
        try {
            validated = await generateQuestions(jdText, skillSubtopics, level, model);
        } catch (err) {
            const message = err instanceof LLMCallError ? err.message : "Question generation failed";
            // Old questionBank/questionBankVersion are left exactly as they were --
            // never persist a partial/out-of-range bank.
            await prisma.job.update({
                where: { id: jobId },
                data: { status: "FAILED", failureReason: message },
            });
            return NextResponse.json({ error: message, code: "QUESTION_GENERATION_FAILED" }, { status: 502 });
        }

        const newVersion = job.questionBankVersion + 1;
        const questionBank: QuestionBank = {
            version: newVersion,
            level,
            generatedAt: new Date().toISOString(),
            questions: validated.questions,
            skippedQuerySnippetReason: validated.skippedQuerySnippetReason,
            skippedCodeSnippetReason: validated.skippedCodeSnippetReason,
        };
        // Both snippet types waived -- this JD likely isn't genuinely
        // "technical." Not a generation failure, but flag it clearly so an
        // admin reviewing Page 2 sees it, per spec edge case.
        if (validated.skippedCodeSnippetReason && validated.skippedQuerySnippetReason) {
            console.warn(
                `[generate-questions] job=${jobId} has both snippet types skipped -- admin review recommended.`
            );
        }

        const updated = await prisma.job.update({
            where: { id: jobId },
            data: {
                status: "GENERATED",
                failureReason: null,
                extractedSkills: skills,
                questionBank: questionBank as any,
                questionBankVersion: newVersion,
            },
            select: {
                id: true,
                status: true,
                extractedSkills: true,
                questionBank: true,
                questionBankVersion: true,
            },
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        // Best-effort: mark FAILED so the job isn't stuck in GENERATING/REGENERATING.
        if (jobId) {
            await prisma.job.update({
                where: { id: jobId },
                data: { status: "FAILED", failureReason: "Unexpected server error during generation" },
            }).catch(() => {});
        }
        return apiErrorResponse({
            route: "/api/jobs/[id]/generate-questions",
            method: "POST",
            error,
            body: { error: "Failed to generate questions" },
            status: 500,
            logLabel: "[GENERATE_QUESTIONS_ERROR]:",
        });
    }
}
