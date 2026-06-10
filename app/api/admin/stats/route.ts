import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getRangeWindow } from "@/lib/date-utils";

function candidateRatingToScore(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(1, Math.min(5, Math.round(value)));
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const feeling = (value as { overallFeeling?: unknown }).overallFeeling;
        switch (String(feeling || "").trim()) {
            case "Terrible":
                return 1;
            case "Okay":
                return 2;
            case "Good":
                return 3;
            case "Great":
                return 4;
            case "Loved it":
                return 5;
            default:
                return 0;
        }
    }
    return 0;
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
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        type AppStatsRow = {
            applications: number;
            applicationsToday: number;
            applicationsPrev: number;
            screenedInPeriod: number;
            shortlisted: number;
            hiredThisMonth: number;
            hiredPrevMonth: number;
            interviewed: number;
            liveInterviews: number;
            needsReview: number;
            invited: number;
            avgTimeToHire: number | null;
            avgTimeToHirePrev: number | null;
        };
        type DriveStatsRow = {
            activeDrives: number;
            closingSoon: number;
        };

        // Single query for all application/interview stats using FILTER
        const [appStats, driveStats, interviewRatings] = await Promise.all([
            prisma.$queryRaw`
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
                    COUNT(*) FILTER (WHERE i."createdAt" >= ${start})::INT AS invited,
                    -- Time metrics
                    AVG(EXTRACT(EPOCH FROM (a."updatedAt" - a."createdAt"))/86400) FILTER (
                        WHERE a."updatedAt" >= ${start} AND a."hiringStatus" ILIKE 'HIRED'
                    )::FLOAT AS "avgTimeToHire",
                    AVG(EXTRACT(EPOCH FROM (a."updatedAt" - a."createdAt"))/86400) FILTER (
                        WHERE a."updatedAt" >= ${prevStart} AND a."updatedAt" < ${prevEnd} AND a."hiringStatus" ILIKE 'HIRED'
                    )::FLOAT AS "avgTimeToHirePrev"
                FROM "Application" a
                JOIN "Drive" d ON d.id = a."driveId"
                LEFT JOIN "Interview" i ON i."applicationId" = a.id
                WHERE d."orgId" = ${orgId}
            ` as Promise<AppStatsRow[]>,
            prisma.$queryRaw`
                SELECT
                    COUNT(*)::INT AS "activeDrives",
                    0::INT AS "closingSoon"
                FROM "Drive"
                WHERE "orgId" = ${orgId}
            ` as Promise<DriveStatsRow[]>,
            prisma.interview.findMany({
                where: { application: { drive: { orgId } }, status: "COMPLETED", completedAt: { gte: start } },
                select: { candidateRating: true }
            })
        ]);

        const s = appStats[0];
        const d = driveStats[0];

        function safeRound(val: number | string | null | undefined) {
            return val != null ? Math.round(Number(val)) : null;
        }

        const avgTimeToHire = safeRound(s.avgTimeToHire);
        const avgTimeToHirePrev = safeRound(s.avgTimeToHirePrev);

        const applications = Number(s.applications);
        const applicationsPrev = Number(s.applicationsPrev);
        const interviewed = Number(s.interviewed);
        const screenedInPeriod = Number(s.screenedInPeriod);
        const shortlisted = Number(s.shortlisted);
        const liveInterviews = Number(s.liveInterviews);
        const ratingValues = interviewRatings
            .map((row) => candidateRatingToScore(row.candidateRating))
            .filter((score) => score > 0);
        const avgRating = ratingValues.length > 0
            ? ratingValues.reduce((sum, score) => sum + score, 0) / ratingValues.length
            : 0;

        const response = NextResponse.json({
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
            avgRating,
            invited: Number(s.invited),
        });
        response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
        return response;
    } catch (error: any) {
        console.error("Dashboard stats error:", error);
        return NextResponse.json({ error: error.message || "Failed to fetch stats" }, { status: 500 });
    }
}
