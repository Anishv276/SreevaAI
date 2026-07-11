import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getRangeStart } from "@/lib/date-utils";
function normalizeStatus(value: unknown) {
    if (typeof value !== "string") return "";
    return value.trim().toLowerCase();
}
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
        const start = getRangeStart(range, from);
        // Top candidates this period = recently completed interviews with highest AI score
        const applications = await prisma.application.findMany({
            where: {
                job: { organizationId: orgId },
                resumeAiScore: { not: null },
                applicationUpdatedAt: { gte: start },
                interview: { interviewStatus: "COMPLETED" },
            },
            select: {
                id: true,
                candidateFullName: true,
                resumeAiScore: true,
                resumeScreeningStatus: true,
                job: { select: { title: true, jobRole: true } },
                interview: {
                    select: {
                        interviewStatus: true,
                    },
                },
            },
            orderBy: { resumeAiScore: "desc" },
            take: 6,
        });
        const candidates = applications.map((app) => {
            // Derive display status
            const statusMap: Record<string, string> = {
                shortlisted: "Shortlisted",
                rejected: "Rejected",
                pending: "Pending",
            };
            const compositeStatus = normalizeStatus(app.resumeScreeningStatus);
            const displayStatus = statusMap[compositeStatus] ?? "Reviewing";
            // Initials from name
            const initials = (app.candidateFullName || "")
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
            return {
                id: app.id,
                name: app.candidateFullName || "Unnamed Candidate",
                initials,
                role: app.job.jobRole || app.job.title,
                jobTitle: app.job.title,
                interviewScore: app.resumeAiScore,
                resumeScore: null,
                status: displayStatus,
            };
        });
        return NextResponse.json({ candidates }, {
            headers: { 'Cache-Control': 'private, max-age=120' }
        });
    } catch (error: unknown) {
        console.error("Top candidates error:", error);
        return NextResponse.json(
            { error: "Failed to fetch top candidates" },
            { status: 500 }
        );
    }
}
