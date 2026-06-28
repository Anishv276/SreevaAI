import { NextRequest, NextResponse } from "next/server";
import { GET as getStats } from "@/app/api/admin/stats/route";
import { GET as getDrivesSummary } from "@/app/api/admin/drives-summary/route";
import { GET as getScoreDistribution } from "@/app/api/admin/score-distribution/route";
import { GET as getTopCandidates } from "@/app/api/admin/top-candidates/route";
import { GET as getNeedsAction } from "@/app/api/admin/needs-action/route";
import { GET as getActivity } from "@/app/api/admin/activity/route";

export async function GET(req: NextRequest) {
    try {
        const [
            statsRes,
            drivesRes,
            scoreRes,
            topRes,
            needsRes,
            activityRes
        ] = await Promise.all([
            getStats(req),
            getDrivesSummary(req),
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
            drivesSummary,
            scoreDistribution,
            topCandidates,
            needsAction,
            activity
        ] = await Promise.all([
            statsRes.json().catch(() => ({})),
            drivesRes.json().catch(() => ({ drives: [] })),
            scoreRes.json().catch(() => ({ total: 0, distribution: [] })),
            topRes.json().catch(() => ({ candidates: [] })),
            needsRes.json().catch(() => ({})),
            activityRes.json().catch(() => ({ feed: [] }))
        ]);

        const response = NextResponse.json({
            stats,
            drivesSummary,
            scoreDistribution,
            topCandidates,
            needsAction,
            activity
        });

        response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
        return response;
    } catch (error) {
        console.error("Dashboard aggregate error:", error);
        return NextResponse.json(
            { error: "Failed to fetch dashboard data" },
            { status: 500 }
        );
    }
}
