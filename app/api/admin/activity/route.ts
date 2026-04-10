import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const orgId = session.orgId;
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // --- Core Fetcher Function ---
        async function fetchActivity(dateCutoff: Date | null) {
            const getWhere = (table: "application" | "interview") => {
                const base = table === "interview" 
                    ? { application: { drive: { orgId } } } 
                    : { drive: { orgId } };
                
                if (dateCutoff) {
                    const timeField = table === "interview" ? "updatedAt" : "createdAt";
                    return { ...base, [timeField]: { gte: dateCutoff } };
                }
                return base;
            };

            return await Promise.all([
                prisma.application.findMany({
                    where: getWhere("application") as any,
                    select: { id: true, createdAt: true, drive: { select: { title: true } } },
                    orderBy: { createdAt: "desc" },
                    take: 20
                }),
                prisma.interview.findMany({
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
                }),
                prisma.application.findMany({
                    where: {
                        ...(dateCutoff ? { updatedAt: { gte: dateCutoff } } : {}),
                        resumeStatus: "rejected", drive: { orgId },
                    },
                    select: { id: true, updatedAt: true, drive: { select: { title: true } } },
                    orderBy: { updatedAt: "desc" },
                    take: 20
                })
            ]);
        }

        // Try recent first
        let [recentApplications, recentInterviews, recentRejections] = await fetchActivity(since);

        // Fallback to all-time if empty
        if (recentApplications.length === 0 && recentInterviews.length === 0 && recentRejections.length === 0) {
            [recentApplications, recentInterviews, recentRejections] = await fetchActivity(null);
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

        // Group new applications by drive + time window (10-min buckets)
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
                action: `${val.count} new application${val.count > 1 ? "s" : ""}`,
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

        // --- Demo Mode Fallback ---
        // If no real activity in 7 days, provide some standard system events
        if (activities.length === 0) {
            const now = Date.now();
            activities.push(
                {
                    id: "demo_1",
                    type: "application",
                    action: "5 new applications received",
                    drive: "Backend Engineer",
                    time: "10m ago",
                    timestamp: now - 10 * 60 * 1000,
                },
                {
                    id: "demo_2",
                    type: "interview_completed",
                    action: "AI interview completed · Score 88%",
                    drive: "Product Designer",
                    time: "2h ago",
                    timestamp: now - 2 * 60 * 60 * 1000,
                },
                {
                    id: "demo_3",
                    type: "application",
                    action: "12 new applications received",
                    drive: "Frontend Intern",
                    time: "5h ago",
                    timestamp: now - 5 * 60 * 60 * 1000,
                }
            );
        }

        const feed = activities.slice(0, 20);
        return NextResponse.json({ feed });
    } catch (error: any) {
        console.error("Activity feed error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
