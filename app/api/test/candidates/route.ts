import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isTestAccessAuthorized } from "@/lib/test-key";
import { apiErrorResponse } from "@/lib/slack-error-logger";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        if (!(await isTestAccessAuthorized(searchParams.get("key")))) {
            return NextResponse.json({ error: "Invalid test key" }, { status: 403 });
        }

        const jobId = searchParams.get("jobId");
        if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

        const applications = await prisma.application.findMany({
            where: { jobId },
            select: {
                id: true,
                candidateFullName: true,
                candidateEmail: true,
                interviewPhaseStatus: true,
                resumeAiScore: true,
                interview: { select: { interviewStatus: true, isTestSession: true, interviewCompletedAt: true } },
            },
            orderBy: { appliedAt: "desc" },
            take: 100,
        });

        const mappedCandidates = applications.map(app => ({
            id: app.id,
            fullName: app.candidateFullName,
            email: app.candidateEmail,
            interviewStatus: app.interviewPhaseStatus,
            aiScore: app.resumeAiScore,
            interview: app.interview ? {
                status: app.interview.interviewStatus,
                isTest: app.interview.isTestSession,
                completedAt: app.interview.interviewCompletedAt,
            } : null,
        }));

        return NextResponse.json({ candidates: mappedCandidates });
    } catch (e) {
        return apiErrorResponse({
            route: "/api/test/candidates",
            method: "GET",
            error: e,
            body: { error: "Failed" },
            status: 500,
            logLabel: "[TEST_CANDIDATES]",
        });
    }
}
