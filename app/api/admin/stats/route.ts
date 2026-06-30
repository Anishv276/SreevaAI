import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getRangeWindow } from "@/lib/date-utils";
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
            shortlistedPrev: number;
            interviewed: number;
            interviewedPrev: number;
            liveInterviews: number;
            needsReview: number;
            invited: number;
            rejected: number;
            rejectedPrev: number;
        };
        type DriveStatsRow = {
            activeDrives: number;
            closingSoon: number;
        };
        const appStats = await prisma.$queryRaw<AppStatsRow[]>`
            SELECT
                COUNT(*) FILTER (WHERE a."createdAt" >= ${start})::INT AS applications,
                COUNT(*) FILTER (WHERE a."createdAt" >= ${todayStart})::INT AS "applicationsToday",
                COUNT(*) FILTER (WHERE a."createdAt" >= ${prevStart} AND a."createdAt" < ${prevEnd})::INT AS "applicationsPrev",
                COUNT(*) FILTER (WHERE a."createdAt" >= ${start} AND a."aiScore" IS NOT NULL)::INT AS "screenedInPeriod",
                COUNT(*) FILTER (WHERE a."updatedAt" >= ${start} AND LOWER(a."resumeStatus") = 'shortlisted')::INT AS shortlisted,
                COUNT(*) FILTER (WHERE a."updatedAt" >= ${prevStart} AND a."updatedAt" < ${prevEnd} AND LOWER(a."resumeStatus") = 'shortlisted')::INT AS "shortlistedPrev",
                COUNT(*) FILTER (
                    WHERE i."status" = 'COMPLETED' AND i."completedAt" >= ${start}
                    AND i."isDeleted" = false
                )::INT AS interviewed,
                COUNT(*) FILTER (
                    WHERE i."status" = 'COMPLETED' AND i."completedAt" >= ${prevStart} AND i."completedAt" < ${prevEnd}
                    AND i."isDeleted" = false
                )::INT AS "interviewedPrev",
                COUNT(*) FILTER (
                    WHERE i."status" = 'IN_PROGRESS'
                    AND i."isDeleted" = false
                )::INT AS "liveInterviews",
                COUNT(*) FILTER (
                    WHERE i."status" = 'COMPLETED' AND a."aiScore" IS NULL
                    AND i."isDeleted" = false
                )::INT AS "needsReview",
                COUNT(*) FILTER (
                    WHERE i."createdAt" >= ${start}
                    AND i."isDeleted" = false
                )::INT AS invited,
                COUNT(*) FILTER (
                    WHERE a."updatedAt" >= ${start}
                    AND (LOWER(a."resumeStatus") = 'rejected' OR LOWER(a."interviewStatus") = 'rejected')
                )::INT AS rejected,
                COUNT(*) FILTER (
                    WHERE a."updatedAt" >= ${prevStart} AND a."updatedAt" < ${prevEnd}
                    AND (LOWER(a."resumeStatus") = 'rejected' OR LOWER(a."interviewStatus") = 'rejected')
                )::INT AS "rejectedPrev"
            FROM "Application" a
            JOIN "Drive" d ON d.id = a."driveId"
            LEFT JOIN "Interview" i ON i."applicationId" = a.id
            WHERE d."orgId" = ${orgId}
              AND a."isDeleted" = false
              AND d."isDeleted" = false
        `;
        const driveStats = await prisma.$queryRaw<DriveStatsRow[]>`
            SELECT
                COUNT(*)::INT AS "activeDrives",
                0::INT AS "closingSoon"
            FROM "Drive"
            WHERE "orgId" = ${orgId}
              AND "isDeleted" = false
        `;
        const scoreStats = await prisma.$queryRaw<Array<{ avgScore: number | null }>>(Prisma.sql`
            SELECT COALESCE(AVG(a."aiScore"), 0)::FLOAT AS "avgScore"
            FROM "Application" a
            JOIN "Drive" d ON d.id = a."driveId"
            WHERE d."orgId" = ${orgId}
              AND a."isDeleted" = false
              AND d."isDeleted" = false
              AND a."aiScore" IS NOT NULL
              AND a."updatedAt" >= ${start}
        `);
        const s = appStats[0];
        const d = driveStats[0];
        function safeRound(val: number | string | null | undefined) {
            return val != null ? Math.round(Number(val)) : null;
        }

        const applications = Number(s.applications);
        const applicationsPrev = Number(s.applicationsPrev);
        const interviewed = Number(s.interviewed);
        const interviewedPrev = Number(s.interviewedPrev);
        const screenedInPeriod = Number(s.screenedInPeriod);
        const shortlisted = Number(s.shortlisted);
        const shortlistedPrev = Number(s.shortlistedPrev);
        const rejected = Number(s.rejected);
        const rejectedPrev = Number(s.rejectedPrev);
        const liveInterviews = Number(s.liveInterviews);
        const avgScore = Number(scoreStats[0]?.avgScore || 0);
        const response = NextResponse.json({
            activeDrives: Number(d.activeDrives),
            closingSoon: Number(d.closingSoon),
            totalCandidates: applications,
            applicationsToday: Number(s.applicationsToday),
            appTrendDelta: applications - applicationsPrev,
            interviewedDelta: interviewed - interviewedPrev,
            shortlistedDelta: shortlisted - shortlistedPrev,
            rejectedDelta: rejected - rejectedPrev,
            aiInterviews: interviewed,
            interviewed,
            interviewRate: screenedInPeriod > 0 ? Math.round((interviewed / screenedInPeriod) * 100) : 0,
            shortlisted,
            rejected,
            shortlistPassRate: applications > 0 ? Math.round((shortlisted / applications) * 100) : 0,
            dropOffRate: (interviewed + liveInterviews) > 0 ? Math.round((liveInterviews / (interviewed + liveInterviews)) * 100) : 0,
            needsReview: Number(s.needsReview),
            liveInterviews,
            avgScore: Math.round(avgScore),
            invited: Number(s.invited),
        });
        response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
        return response;
    } catch (error: unknown) {
        console.error("Dashboard stats error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to fetch stats" },
            { status: 500 }
        );
    }
}
