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
            Array<{ id: string; createdAt: Date; drive: { title: string | null } | null }>,
            Array<{
                id: string;
                status: string;
                updatedAt: Date;
                completedAt: Date | null;
                application: { aiScore: number | null; drive: { title: string | null } | null };
            }>,
            Array<{ id: string; updatedAt: Date; drive: { title: string | null } | null }>
        ]> {
            const applicationWhere = {
                drive: { orgId },
                ...(dateCutoff ? { createdAt: { gte: dateCutoff } } : {}),
            };
            const recentApplications = await prisma.application.findMany({
                where: applicationWhere,
                select: { id: true, createdAt: true, drive: { select: { title: true } } },
                orderBy: { createdAt: "desc" },
                take: 20
            });
            const recentInterviews = await prisma.interview.findMany({
                where: {
                    ...(dateCutoff ? { updatedAt: { gte: dateCutoff } } : {}),
                    application: { drive: { orgId } },
                    status: { in: ["COMPLETED", "IN_PROGRESS"] },
                },
                select: {
                    id: true, status: true, updatedAt: true, completedAt: true,
                    application: { select: { aiScore: true, drive: { select: { title: true } } } },
                },
                orderBy: { updatedAt: "desc" },
                take: 20
            });
            const recentRejections = await prisma.application.findMany({
                where: {
                    ...(dateCutoff ? { updatedAt: { gte: dateCutoff } } : {}),
                    resumeStatus: "rejected", drive: { orgId },
                },
                select: { id: true, updatedAt: true, drive: { select: { title: true } } },
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
            drive: string;
            time: string;
            timestamp: number;
        };
        const activities: ActivityItem[] = [];
        // Group new uploads by drive + time window (10-min buckets)
        const appsByDriveBucket: Record<string, { count: number; drive: string; time: Date }> = {};
        for (const app of recentApplications) {
            const bucket = Math.floor(app.createdAt.getTime() / (10 * 60 * 1000));
            const driveTitle = app.drive?.title || "Unknown Drive";
            const key = `${driveTitle}__${bucket}`;
            if (!appsByDriveBucket[key]) {
                appsByDriveBucket[key] = { count: 0, drive: driveTitle, time: app.createdAt };
            }
            appsByDriveBucket[key].count++;
        }
        for (const [key, val] of Object.entries(appsByDriveBucket)) {
            activities.push({
                id: `app_${key}`,
                type: "application",
                action: `${val.count} new upload${val.count > 1 ? "s" : ""}`,
                drive: val.drive,
                time: timeAgo(val.time),
                timestamp: val.time.getTime(),
            });
        }
        // Completed interviews
        const completedByDrive: Record<string, { scores: number[]; drive: string; time: Date }> = {};
        for (const iv of recentInterviews) {
            if (iv.status !== "COMPLETED") continue;
            const key = iv.application.drive?.title || "Unknown Drive";
            if (!completedByDrive[key]) {
                completedByDrive[key] = { scores: [], drive: key, time: iv.updatedAt };
            }
            if (iv.application.aiScore != null) completedByDrive[key].scores.push(iv.application.aiScore);
            if (iv.updatedAt > completedByDrive[key].time) completedByDrive[key].time = iv.updatedAt;
        }
        for (const [key, val] of Object.entries(completedByDrive)) {
            const avgScore = val.scores.length
                ? Math.round(val.scores.reduce((a, b) => a + b, 0) / val.scores.length)
                : null;
            const scoreText = avgScore != null ? ` · Score ${avgScore}%` : "";
            const countText = val.scores.length > 1 ? ` for ${val.scores.length} candidates` : "";
            activities.push({
                id: `iv_${key}`,
                type: "interview_completed",
                action: `AI interview${countText} completed${scoreText}`,
                drive: val.drive,
                time: timeAgo(val.time),
                timestamp: val.time.getTime(),
            });
        }
        // Rejections grouped by drive
        const rejByDrive: Record<string, { count: number; drive: string; time: Date }> = {};
        for (const rej of recentRejections) {
            const key = rej.drive?.title || "Unknown Drive";
            if (!rejByDrive[key]) {
                rejByDrive[key] = { count: 0, drive: key, time: rej.updatedAt };
            }
            rejByDrive[key].count++;
            if (rej.updatedAt > rejByDrive[key].time) rejByDrive[key].time = rej.updatedAt;
        }
        for (const [key, val] of Object.entries(rejByDrive)) {
            activities.push({
                id: `rej_${key}`,
                type: "rejection",
                action: `${val.count} rejection email${val.count > 1 ? "s" : ""} sent`,
                drive: val.drive,
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
