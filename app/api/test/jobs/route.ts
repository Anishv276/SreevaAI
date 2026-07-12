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

        const orgId = searchParams.get("orgId");
        if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

        const jobs = await prisma.job.findMany({
            where: { organization: { id: orgId }, isDeleted: false },
            select: { id: true, title: true, jobRole: true, _count: { select: { applications: true } } },
            orderBy: { jobCreatedAt: "desc" },
        });

        return NextResponse.json({ jobs });
    } catch (e) {
        return apiErrorResponse({
            route: "/api/test/jobs",
            method: "GET",
            error: e,
            body: { error: "Failed" },
            status: 500,
            logLabel: "[TEST_JOBS]",
        });
    }
}
