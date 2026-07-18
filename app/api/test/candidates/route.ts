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

        const candidates = applications.map(a => ({
            id: a.id,
            fullName: a.candidateFullName,
            email: a.candidateEmail,
            interviewStatus: a.interviewPhaseStatus,
            aiScore: a.resumeAiScore,
            interview: a.interview
                ? {
                    status: a.interview.interviewStatus,
                    isTest: a.interview.isTestSession,
                    completedAt: a.interview.interviewCompletedAt,
                }
                : null,
        }));

        return NextResponse.json({ candidates });
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
