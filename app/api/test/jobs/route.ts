import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TEST_KEY = process.env.TEST_PAGE_KEY || "1285";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        if (searchParams.get("key") !== TEST_KEY) {
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
        console.error("[TEST_JOBS]", e);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
