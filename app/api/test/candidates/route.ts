import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isTestAccessAuthorized } from "@/lib/test-key";

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

        return NextResponse.json({ candidates: applications });
    } catch (e) {
        console.error("[TEST_CANDIDATES]", e);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
