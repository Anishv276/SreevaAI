import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getRangeStart } from "@/lib/date-utils";
function timeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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
        // --- Core Fetcher Function ---
        async function fetchActivity(dateCutoff: Date | null): Promise<[
            Array<{ id: string; createdAt: Date; job: { title: string | null } | null }>,
            Array<{
                id: string;
                status: string;
                updatedAt: Date;
                completedAt: Date | null;
                application: { aiScore: number | null; job: { title: string | null } | null };
            }>,
            Array<{ id: string; updatedAt: Date; job: { title: string | null } | null }>
        ]> {
            const applicationWhere = {
                job: { orgId },
                ...(dateCutoff ? { createdAt: { gte: dateCutoff } } : {}),
            };
            const recentApplications = await prisma.application.findMany({
                where: applicationWhere,
                select: { id: true, createdAt: true, job: { select: { title: true } } },
                orderBy: { createdAt: "desc" },
                take: 20
            });
            const recentInterviews = await prisma.interview.findMany({
                where: {
                    ...(dateCutoff ? { updatedAt: { gte: dateCutoff } } : {}),
                    application: { job: { orgId } },
                    status: { in: ["COMPLETED", "IN_PROGRESS"] },
                },
                select: {
                    id: true, status: true, updatedAt: true, completedAt: true,
                    application: { select: { aiScore: true, job: { select: { title: true } } } },
                },
                orderBy: { updatedAt: "desc" },
                take: 20
            });
            const recentRejections = await prisma.application.findMany({
                where: {
                    ...(dateCutoff ? { updatedAt: { gte: dateCutoff } } : {}),
                    resumeStatus: { in: ["rejected", "REJECTED"] }, job: { orgId },
                },
                select: { id: true, updatedAt: true, job: { select: { title: true } } },
                orderBy: { updatedAt: "desc" },
                take: 20
            });
            return [recentApplications, recentInterviews, recentRejections];
        }
        // Fetch activity within range; if nothing found, widen to 90 days instead of all-time
        let [recentApplications, recentInterviews, recentRejections] = await fetchActivity(start);
        if (recentApplications.length === 0 && recentInterviews.length === 0 && recentRejections.length === 0) {
            const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            [recentApplications, recentInterviews, recentRejections] = await fetchActivity(ninetyDaysAgo);
        }
        // --- Build activity items ---
        type ActivityItem = {
            id: string;
            type: "application" | "interview_completed" | "rejection";
            action: string;
            job: string;
            time: string;
            timestamp: number;
        };
        const activities: ActivityItem[] = [];
        // Group new uploads by job + time window (10-min buckets)
        const appsByJobBucket: Record<string, { count: number; job: string; time: Date }> = {};
        for (const app of recentApplications) {
            const bucket = Math.floor(app.createdAt.getTime() / (10 * 60 * 1000));
            const jobTitle = app.job?.title || "Unknown Job";
            const key = `${jobTitle}__${bucket}`;
            if (!appsByJobBucket[key]) {
                appsByJobBucket[key] = { count: 0, job: jobTitle, time: app.createdAt };
            }
            appsByJobBucket[key].count++;
        }
        for (const [key, val] of Object.entries(appsByJobBucket)) {
            activities.push({
                id: `app_${key}`,
                type: "application",
                action: `${val.count} new upload${val.count > 1 ? "s" : ""}`,
                job: val.job,
                time: timeAgo(val.time),
                timestamp: val.time.getTime(),
            });
        }
        // Completed interviews
        const completedByJob: Record<string, { scores: number[]; job: string; time: Date }> = {};
        for (const iv of recentInterviews) {
            if (iv.status !== "COMPLETED") continue;
            const key = iv.application.job?.title || "Unknown Job";
            if (!completedByJob[key]) {
                completedByJob[key] = { scores: [], job: key, time: iv.updatedAt };
            }
            if (iv.application.aiScore != null) completedByJob[key].scores.push(iv.application.aiScore);
            if (iv.updatedAt > completedByJob[key].time) completedByJob[key].time = iv.updatedAt;
        }
        for (const [key, val] of Object.entries(completedByJob)) {
            const avgScore = val.scores.length
                ? Math.round(val.scores.reduce((a, b) => a + b, 0) / val.scores.length)
                : null;
            const scoreText = avgScore != null ? ` · Score ${avgScore}%` : "";
            const countText = val.scores.length > 1 ? ` for ${val.scores.length} candidates` : "";
            activities.push({
                id: `iv_${key}`,
                type: "interview_completed",
                action: `AI interview${countText} completed${scoreText}`,
                job: val.job,
                time: timeAgo(val.time),
                timestamp: val.time.getTime(),
            });
        }
        // Rejections grouped by job
        const rejByJob: Record<string, { count: number; job: string; time: Date }> = {};
        for (const rej of recentRejections) {
            const key = rej.job?.title || "Unknown Job";
            if (!rejByJob[key]) {
                rejByJob[key] = { count: 0, job: key, time: rej.updatedAt };
            }
            rejByJob[key].count++;
            if (rej.updatedAt > rejByJob[key].time) rejByJob[key].time = rej.updatedAt;
        }
        for (const [key, val] of Object.entries(rejByJob)) {
            activities.push({
                id: `rej_${key}`,
                type: "rejection",
                action: `${val.count} rejection email${val.count > 1 ? "s" : ""} sent`,
                job: val.job,
                time: timeAgo(val.time),
                timestamp: val.time.getTime(),
            });
        }
        // Sort by most recent first
        activities.sort((a, b) => b.timestamp - a.timestamp);
        const feed = activities.slice(0, 20);
        return NextResponse.json({ feed }, {
            headers: { 'Cache-Control': 'private, max-age=60' }
        });
    } catch (error: unknown) {
        console.error("Activity feed error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to fetch activity feed" },
            { status: 500 }
        );
    }
}
