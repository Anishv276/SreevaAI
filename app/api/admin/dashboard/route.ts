import { NextRequest, NextResponse } from "next/server";
import { GET as getStats } from "@/app/api/admin/stats/route";
import { GET as getJobsSummary } from "@/app/api/admin/jobs-summary/route";
import { GET as getScoreDistribution } from "@/app/api/admin/score-distribution/route";
import { GET as getTopCandidates } from "@/app/api/admin/top-candidates/route";
import { GET as getNeedsAction } from "@/app/api/admin/needs-action/route";
import { GET as getActivity } from "@/app/api/admin/activity/route";
import { apiErrorResponse } from "@/lib/slack-error-logger";

export async function GET(req: NextRequest) {
    try {
        const [
            statsRes,
            jobsRes,
            scoreRes,
            topRes,
            needsRes,
            activityRes
        ] = await Promise.all([
            getStats(req),
            getJobsSummary(req),
            getScoreDistribution(req),
            getTopCandidates(req),
            getNeedsAction(),
            getActivity(req)
        ]);

        if (statsRes.status === 401) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [
            stats,
            jobsSummary,
            scoreDistribution,
            topCandidates,
            needsAction,
            activity
        ] = await Promise.all([
            statsRes.json().catch(() => ({})),
            jobsRes.json().catch(() => ({ jobs: [] })),
            scoreRes.json().catch(() => ({ total: 0, distribution: [] })),
            topRes.json().catch(() => ({ candidates: [] })),
            needsRes.json().catch(() => ({})),
            activityRes.json().catch(() => ({ feed: [] }))
        ]);

        const response = NextResponse.json({
            stats,
            jobsSummary,
            scoreDistribution,
            topCandidates,
            needsAction,
            activity
        });

        response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
        return response;
    } catch (error) {
        return apiErrorResponse({
            route: "/api/admin/dashboard",
            method: "GET",
            error,
            body: { error: "Failed to fetch dashboard data" },
            status: 500,
            logLabel: "Dashboard aggregate error:",
        });
    }
}
