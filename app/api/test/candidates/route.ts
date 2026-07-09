import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdminRole } from "@/lib/auth";

const TEST_KEY = process.env.TEST_PAGE_KEY || "1285";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        if (searchParams.get("key") !== TEST_KEY) {
            return NextResponse.json({ error: "Invalid test key" }, { status: 403 });
        }

        const jobId = searchParams.get("jobId");
        if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

        const applications = await prisma.application.findMany({
            where: { jobId },
            select: {
                id: true,
                fullName: true,
                email: true,
                interviewStatus: true,
                aiScore: true,
                interview: { select: { status: true, isTest: true, completedAt: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
        });

        return NextResponse.json({ candidates: applications });
    } catch (e) {
        console.error("[TEST_CANDIDATES]", e);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
