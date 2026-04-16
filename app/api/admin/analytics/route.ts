import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const orgId = session.orgId;
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // Overview Stats - Using actual DB fields
        const [
            totalApplications,
            activeDrives,
            pendingApplications,
            rejectedApplications,
            interviewsScheduled,
            interviewsCompleted,
            hiredThisMonth
        ] = await Promise.all([
            prisma.application.count({ where: { drive: { orgId } } }),
            prisma.drive.count({ where: { orgId, status: 'ACTIVE' } }),
            prisma.application.count({ where: { drive: { orgId }, resumeStatus: 'pending' } }),
            prisma.application.count({ where: { drive: { orgId }, resumeStatus: 'rejected' } }),
            prisma.interview.count({ where: { application: { drive: { orgId } }, status: { in: ['SCHEDULED', 'PENDING', 'IN_PROGRESS'] } } }),
            prisma.interview.count({ where: { application: { drive: { orgId } }, status: 'COMPLETED' } }),
            prisma.application.count({
                where: { hiringStatus: 'hired', updatedAt: { gte: monthStart }, drive: { orgId } }
            })
        ]);

        // Funnel - Using actual Application statuses
        const [statusApplied, statusShortlisted, statusInterview, statusOffer, statusHired] = await Promise.all([
            prisma.application.count({ where: { drive: { orgId }, resumeStatus: 'pending' } }),
            prisma.application.count({ where: { drive: { orgId }, resumeStatus: 'shortlisted' } }),
            prisma.application.count({ where: { drive: { orgId }, interviewStatus: { in: ['inprogress', 'finished'] } } }),
            prisma.application.count({ where: { drive: { orgId }, hiringStatus: 'pending' } }),
            prisma.application.count({ where: { drive: { orgId }, hiringStatus: 'hired' } })
        ]);

        // ── AGGREGATE OPTIMIZATION: Interview Stats ────────
        const interviewAgg = await prisma.interview.aggregate({
            where: { application: { drive: { orgId } } },
            _avg: { interviewDuration: true }
        });
        const avgInterviewDuration = Math.round(interviewAgg._avg.interviewDuration || 0);

        // ── DB BUCKETING: Score Distribution ───────────────
        const scoreGroups = await prisma.$queryRawUnsafe<any[]>(`
            SELECT 
                CASE 
                    WHEN "aiScore" < 20 THEN '0-20'
                    WHEN "aiScore" < 40 THEN '20-40'
                    WHEN "aiScore" < 60 THEN '40-60'
                    WHEN "aiScore" < 80 THEN '60-80'
                    ELSE '80-100'
                END as range,
                COUNT(*)::INT as count
            FROM "Application" a JOIN "Drive" d ON a."driveId" = d."id"
            WHERE d."orgId" = $1 AND "aiScore" IS NOT NULL
            GROUP BY range
        `, orgId);

        const scoreRanges = [
            { range: "0-20", count: 0 },
            { range: "20-40", count: 0 },
            { range: "40-60", count: 0 },
            { range: "60-80", count: 0 },
            { range: "80-100", count: 0 }
        ];

        scoreGroups.forEach(group => {
            const range = scoreRanges.find(r => r.range === group.range);
            if (range) range.count = group.count;
        });

        // Trends - Last 7 days (using actual createdAt)
        const trendsLabels: string[] = [];
        const trendsApplications: number[] = [];
        const trendsHired: number[] = [];

        for (let i = 6; i >= 0; i--) {
            const dayStart = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
            trendsLabels.push(dayStart.toLocaleDateString('en-US', { weekday: 'short' }));

            const dayApps = await prisma.application.count({
                where: { drive: { orgId }, createdAt: { gte: dayStart, lt: dayEnd } }
            });
            trendsApplications.push(dayApps);

            const dayHired = await prisma.application.count({
                where: { drive: { orgId }, hiringStatus: 'hired', updatedAt: { gte: dayStart, lt: dayEnd } }
            });
            trendsHired.push(dayHired);
        }

        // ── N+1 RESOLUTION: Drive Performance ────────────────
        const drives = await prisma.drive.findMany({
            where: { orgId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true,
                title: true,
                department: true,
                type: true,
                status: true,
                deadline: true,
                createdAt: true,
                _count: { select: { applications: true } }
            }
        });

        const driveIds = drives.map(d => d.id);
        
        let drivePerformance: any[] = [];
        if (driveIds.length > 0) {
            const aggregatedAppStats = await prisma.application.groupBy({
                by: ['driveId', 'hiringStatus', 'interviewStatus', 'resumeStatus'],
                where: { driveId: { in: driveIds } },
                _count: { id: true }
            });

            const statCache: Record<string, { hired: number, pending: number, interview: number }> = {};
            for (const d of driveIds) statCache[d] = { hired: 0, pending: 0, interview: 0 };
            
            for (const stat of aggregatedAppStats) {
                if ((stat.hiringStatus || "").toLowerCase() === 'hired') statCache[stat.driveId].hired += stat._count.id;
                if ((stat.interviewStatus || "").toLowerCase() === 'finished' || (stat.interviewStatus || "").toLowerCase() === 'completed') statCache[stat.driveId].interview += stat._count.id;
                if ((stat.resumeStatus || "").toLowerCase() === 'pending') statCache[stat.driveId].pending += stat._count.id;
            }

            drivePerformance = drives.map((drive) => {
                const apps = drive._count.applications;
                const stats = statCache[drive.id];
                const conversion = apps > 0 ? Math.round((stats.hired / apps) * 100 * 10) / 10 : 0;
                
                return {
                    ...drive,
                    applications: apps,
                    hired: stats.hired,
                    interviewComplete: stats.interview,
                    pending: stats.pending,
                    conversionRate: conversion
                };
            });
        }

        // Status Breakdown
        const statusBreakdown = await prisma.application.groupBy({
            by: ['resumeStatus'],
            where: { drive: { orgId } },
            _count: { resumeStatus: true }
        });

        // ── AGGREGATE OPTIMIZATIONS: Interview Status ────────
        const interviewGroupStats = await prisma.interview.groupBy({
            by: ['status'],
            where: { application: { drive: { orgId } } },
            _count: { id: true }
        });
        
        let totalInterviews = 0;
        let completedInterviews = 0;
        for (const row of interviewGroupStats) {
            totalInterviews += row._count.id;
            if (row.status === 'COMPLETED') completedInterviews += row._count.id;
        }

        // ── DB RAW CALCULATION: Response Time ──────── 
        const timeMetrics = await prisma.$queryRawUnsafe<any[]>(`
            SELECT AVG(EXTRACT(EPOCH FROM (a."updatedAt" - a."createdAt"))/86400)::FLOAT as avg_days
            FROM "Application" a JOIN "Drive" d ON a."driveId" = d."id"
            WHERE d."orgId" = $1 AND LOWER(a."resumeStatus") != 'pending'
        `, orgId);
        const avgResponseTime = Math.round(timeMetrics[0]?.avg_days || 0);

        // ── AGGREGATE OPTIMIZATIONS: AI Pass Rates ────────
        const scoreAgg = await prisma.application.aggregate({
            where: { drive: { orgId }, aiScore: { not: null } },
            _avg: { aiScore: true },
            _count: { aiScore: true }
        });
        const passingCount = await prisma.application.count({
            where: { drive: { orgId }, aiScore: { gte: 60 } }
        });

        const avgAIScore = Math.round(scoreAgg._avg.aiScore || 0);
        const passRate = scoreAgg._count.aiScore > 0 
             ? Math.round((passingCount / scoreAgg._count.aiScore) * 100) 
             : 0;

        // Drive deadline tracking
        const driveDeadlines = await prisma.drive.findMany({
            where: { orgId, deadline: { not: null }, status: 'ACTIVE' },
            select: { id: true, title: true, deadline: true, positions: true }
        });
        
        const upcomingDeadlines = driveDeadlines
            .filter(d => d.deadline && new Date(d.deadline) > now && new Date(d.deadline) < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000))
            .map(d => ({ id: d.id, title: d.title, deadline: d.deadline, positions: d.positions }))
            .slice(0, 5);

        // Top departments by applications
        const deptApps = await prisma.drive.findMany({
            where: { orgId },
            select: { department: true, _count: { select: { applications: true } } }
        });

        const deptMap = new Map<string, number>();
        deptApps.forEach(d => {
            const current = deptMap.get(d.department) || 0;
            deptMap.set(d.department, current + d._count.applications);
        });

        const departmentStats = Array.from(deptMap.entries())
            .map(([dept, count]) => ({ department: dept, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return NextResponse.json({
            overview: {
                totalApplications,
                activeDrives,
                pendingApplications,
                rejectedApplications,
                interviewsScheduled,
                interviewsCompleted,
                hiredThisMonth,
                avgResponseTime,
                avgAIScore,
                passRate,
                totalInterviews,
                completedInterviews
            },
            funnel: {
                applied: statusApplied,
                shortlisted: statusShortlisted,
                interview: statusInterview,
                offer: statusOffer,
                hired: statusHired
            },
            trends: {
                labels: trendsLabels,
                applications: trendsApplications,
                hired: trendsHired
            },
            scores: scoreRanges,
            drives: drivePerformance,
            statusBreakdown: statusBreakdown.map(s => ({ status: s.resumeStatus, count: s._count.resumeStatus })),
            departments: departmentStats,
            deadlines: upcomingDeadlines
        });
    } catch (error) {
        console.error("Analytics API error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}