import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

function getRangeWindow(range: string, from?: string, to?: string): { start: Date; prevStart: Date; prevEnd: Date } {
    const now = new Date();

    if (range === "all") {
        return { 
            start: new Date(0), 
            prevStart: new Date(0), 
            prevEnd: new Date(0) 
        };
    }
    if (range === "today") {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - 1);
        const prevEnd = new Date(start);
        return { start, prevStart, prevEnd };
    }
    if (range === "week") {
        const start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - 7);
        const prevEnd = new Date(start);
        return { start, prevStart, prevEnd };
    }
    if (range === "custom" && from && to) {
        const start = new Date(from);
        const end = new Date(to);
        const diff = end.getTime() - start.getTime();
        const prevStart = new Date(start.getTime() - diff);
        return { start, prevStart, prevEnd: new Date(start) };
    }
    // default: month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, prevStart, prevEnd };
}

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const orgId = session.orgId;
        const { searchParams } = new URL(req.url);
        const range = searchParams.get("range") ?? "month";
        const from = searchParams.get("from") ?? undefined;
        const to = searchParams.get("to") ?? undefined;

        const { start, prevStart, prevEnd } = getRangeWindow(range, from, to);
        const now = new Date();
        const closingSoonCutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Single query for all application/interview stats using FILTER
        const [appStats, driveStats, hiredApps, hiredAppsPrev, feedbackStats] = await Promise.all([
            prisma.$queryRaw<any[]>`
                SELECT
                    COUNT(*) FILTER (WHERE a."createdAt" >= ${start})::INT AS applications,
                    COUNT(*) FILTER (WHERE a."createdAt" >= ${todayStart})::INT AS "applicationsToday",
                    COUNT(*) FILTER (WHERE a."createdAt" >= ${prevStart} AND a."createdAt" < ${prevEnd})::INT AS "applicationsPrev",
                    COUNT(*) FILTER (WHERE a."createdAt" >= ${start} AND a."aiScore" IS NOT NULL)::INT AS "screenedInPeriod",
                    COUNT(*) FILTER (WHERE a."updatedAt" >= ${start} AND a."resumeStatus" ILIKE 'SHORTLISTED')::INT AS shortlisted,
                    COUNT(*) FILTER (WHERE a."updatedAt" >= ${start} AND a."hiringStatus" ILIKE 'HIRED')::INT AS "hiredThisMonth",
                    COUNT(*) FILTER (WHERE a."updatedAt" >= ${prevStart} AND a."updatedAt" < ${prevEnd} AND a."hiringStatus" ILIKE 'HIRED')::INT AS "hiredPrevMonth",
                    COUNT(*) FILTER (
                        WHERE i."status" = 'COMPLETED' AND i."completedAt" >= ${start}
                    )::INT AS interviewed,
                    COUNT(*) FILTER (WHERE i."status" = 'IN_PROGRESS')::INT AS "liveInterviews",
                    COUNT(*) FILTER (WHERE i."status" = 'COMPLETED' AND a."aiScore" IS NULL)::INT AS "needsReview",
                    COUNT(*) FILTER (WHERE i."createdAt" >= ${start})::INT AS invited
                FROM "Application" a
                JOIN "Drive" d ON d.id = a."driveId"
                LEFT JOIN "Interview" i ON i."applicationId" = a.id
                WHERE d."orgId" = ${orgId}
            `,
            prisma.$queryRaw<any[]>`
                SELECT
                    COUNT(*) FILTER (WHERE status IN ('ACTIVE','Active'))::INT AS "activeDrives",
                    COUNT(*) FILTER (
                        WHERE status IN ('ACTIVE','Active')
                        AND deadline >= ${now}
                        AND deadline <= ${closingSoonCutoff}
                    )::INT AS "closingSoon"
                FROM "Drive"
                WHERE "orgId" = ${orgId}
            `,
            prisma.application.findMany({
                where: { updatedAt: { gte: start }, hiringStatus: { equals: "Hired", mode: 'insensitive' }, drive: { orgId } },
                select: { createdAt: true, updatedAt: true },
            }),
            prisma.application.findMany({
                where: { updatedAt: { gte: prevStart, lt: prevEnd }, hiringStatus: { equals: "Hired", mode: 'insensitive' }, drive: { orgId } },
                select: { createdAt: true, updatedAt: true },
            }),
            prisma.interview.aggregate({
                where: { application: { drive: { orgId } }, candidateRating: { not: null } },
                _avg: { candidateRating: true }
            })
        ]);

        const s = appStats[0];
        const d = driveStats[0];

        function avgDays(apps: { createdAt: Date; updatedAt: Date }[]) {
            if (!apps.length) return null;
            const total = apps.reduce((sum, a) => sum + (a.updatedAt.getTime() - a.createdAt.getTime()), 0);
            return Math.round(total / apps.length / (1000 * 60 * 60 * 24));
        }

        const avgTimeToHire = avgDays(hiredApps);
        const avgTimeToHirePrev = avgDays(hiredAppsPrev);

        const applications = Number(s.applications);
        const applicationsPrev = Number(s.applicationsPrev);
        const interviewed = Number(s.interviewed);
        const screenedInPeriod = Number(s.screenedInPeriod);
        const shortlisted = Number(s.shortlisted);
        const liveInterviews = Number(s.liveInterviews);

        return NextResponse.json({
            activeDrives: Number(d.activeDrives),
            closingSoon: Number(d.closingSoon),
            totalCandidates: applications,
            applicationsToday: Number(s.applicationsToday),
            appTrendDelta: applications - applicationsPrev,
            aiInterviews: interviewed,
            interviewed,
            interviewRate: screenedInPeriod > 0 ? Math.round((interviewed / screenedInPeriod) * 100) : 0,
            shortlisted,
            shortlistPassRate: applications > 0 ? Math.round((shortlisted / applications) * 100) : 0,
            hiredThisMonth: Number(s.hiredThisMonth),
            hiredPrevMonth: Number(s.hiredPrevMonth),
            avgTimeToHire,
            timeToHireDiff: avgTimeToHire != null && avgTimeToHirePrev != null ? avgTimeToHire - avgTimeToHirePrev : null,
            dropOffRate: (interviewed + liveInterviews) > 0 ? Math.round((liveInterviews / (interviewed + liveInterviews)) * 100) : 0,
            needsReview: Number(s.needsReview),
            liveInterviews,
            avgRating: feedbackStats._avg.candidateRating || 0,
            invited: Number(s.invited),
        });
    } catch (error: any) {
        console.error("Dashboard stats error:", error);
        return NextResponse.json({ error: error.message || "Failed to fetch stats" }, { status: 500 });
    }
}
