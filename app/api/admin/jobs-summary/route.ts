import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getRangeStart } from "@/lib/date-utils";
export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const orgId = session.orgId;
        const { searchParams } = new URL(req.url);
        const range = searchParams.get("range") ?? "month";
        const from = searchParams.get("from") ?? undefined;
        const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") || "20")));
        const start = getRangeStart(range, from);
        const jobs = await prisma.job.findMany({
            where: { orgId, isDeleted: false },
            select: {
                id: true,
                title: true,
                role: true,
                screeningThreshold: true,
                applications: {
                    where: { createdAt: { gte: start } },
                    select: {
                        id: true,
                        resumeStatus: true,
                        aiScore: true,
                        interview: { select: { status: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
        const result = jobs.map((job: (typeof jobs)[number]) => {
            const apps = job.applications;
            const applied = apps.length;
            const screened = apps.filter((a: (typeof apps)[number]) => a.aiScore != null).length;
            const interviewed = apps.filter(
                (a: (typeof apps)[number]) => a.interview?.status === "COMPLETED"
            ).length;
            const shortlisted = apps.filter((a: (typeof apps)[number]) =>
                ["shortlisted", "SHORTLISTED"].includes(a.resumeStatus ?? "")
            ).length;
            // Screening progress: screened/applied as %
            const screeningPct = applied > 0 ? Math.round((screened / applied) * 100) : 0;
            return {
                id: job.id,
                title: job.title,
                role: job.role,
                screeningThreshold: Number(job.screeningThreshold ?? 60),
                screeningPct,
                applied,
                screened,
                interviewed,
                shortlisted,
            };
        });
        return NextResponse.json({ jobs: result });
    } catch (error: any) {
        console.error("Jobs summary error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
