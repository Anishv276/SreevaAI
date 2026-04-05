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
            prisma.application.count({ where: { drive: { orgId }, status: 'APPLIED' } }),
            prisma.application.count({ where: { drive: { orgId }, status: 'REJECTED' } }),
            prisma.interview.count({ where: { application: { drive: { orgId } }, status: { in: ['SCHEDULED', 'PENDING', 'IN_PROGRESS'] } } }),
            prisma.interview.count({ where: { application: { drive: { orgId } }, status: 'COMPLETED' } }),
            prisma.application.count({
                where: { status: 'Hired', updatedAt: { gte: monthStart }, drive: { orgId } }
            })
        ]);

        // Funnel - Using actual Application statuses
        const [statusApplied, statusShortlisted, statusInterview, statusOffer, statusHired] = await Promise.all([
            prisma.application.count({ where: { drive: { orgId }, status: 'APPLIED' } }),
            prisma.application.count({ where: { drive: { orgId }, status: 'SHORTLISTED' } }),
            prisma.application.count({ where: { drive: { orgId }, status: { in: ['INTERVIEW', 'INTERVIEW_COMPLETED', 'Interview Completed'] } } }),
            prisma.application.count({ where: { drive: { orgId }, status: { in: ['OFFER', 'OFFER_SENT', 'Offer Sent'] } } }),
            prisma.application.count({ where: { drive: { orgId }, status: 'Hired' } })
        ]);

        // Interview Stats
        const interviewStats = await prisma.interview.findMany({
            where: { application: { drive: { orgId } } },
            select: { status: true, interviewDuration: true }
        });

        const avgInterviewDuration = interviewStats.length > 0
            ? Math.round(interviewStats.reduce((acc, i) => acc + (i.interviewDuration || 0), 0) / interviewStats.length)
            : 0;

        // Score Distribution - Using actual aiScore field
        const scoredApplications = await prisma.application.findMany({
            where: { drive: { orgId }, aiScore: { not: null } },
            select: { aiScore: true }
        });

        const scoreRanges = [
            { range: "0-20", min: 0, max: 20, count: 0 },
            { range: "20-40", min: 20, max: 40, count: 0 },
            { range: "40-60", min: 40, max: 60, count: 0 },
            { range: "60-80", min: 60, max: 80, count: 0 },
            { range: "80-100", min: 80, max: 100, count: 0 }
        ];

        scoredApplications.forEach(app => {
            const score = app.aiScore || 0;
            const range = scoreRanges.find(r => score >= r.min && score < r.max);
            if (range) range.count++;
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
                where: { drive: { orgId }, status: 'Hired', updatedAt: { gte: dayStart, lt: dayEnd } }
            });
            trendsHired.push(dayHired);
        }

        // Drive Performance - Using actual Drive fields
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

        const drivePerformance = await Promise.all(drives.map(async (drive) => {
            const apps = drive._count.applications;
            const hired = await prisma.application.count({ where: { driveId: drive.id, status: 'Hired' } });
            const interviewComplete = await prisma.application.count({ 
                where: { driveId: drive.id, status: { in: ['INTERVIEW_COMPLETED', 'Interview Completed'] } } 
            });
            const pending = await prisma.application.count({ where: { driveId: drive.id, status: 'APPLIED' } });
            const conversion = apps > 0 ? Math.round((hired / apps) * 100 * 10) / 10 : 0;
            
            return {
                id: drive.id,
                title: drive.title,
                department: drive.department,
                type: drive.type,
                applications: apps,
                hired,
                interviewComplete,
                pending,
                conversionRate: conversion,
                status: drive.status,
                deadline: drive.deadline,
                createdAt: drive.createdAt
            };
        }));

        // Status Breakdown
        const statusBreakdown = await prisma.application.groupBy({
            by: ['status'],
            where: { drive: { orgId } },
            _count: { status: true }
        });

        // Interview-specific metrics (from Interview table)
        const interviewMetrics = await prisma.interview.findMany({
            where: { application: { drive: { orgId } } },
            select: { status: true, interviewDuration: true, startedAt: true, completedAt: true }
        });

        const totalInterviews = interviewMetrics.length;
        const completedInterviews = interviewMetrics.filter(i => i.status === 'COMPLETED').length;
        
        // Time-based metrics (from Application createdAt/updatedAt)
        const recentApps = await prisma.application.findMany({
            where: { drive: { orgId } },
            select: { status: true, createdAt: true, updatedAt: true, aiScore: true }
        });

        // Avg time from application to first response
        let avgResponseTime = 0;
        const respondedApps = recentApps.filter(a => a.status !== 'APPLIED');
        if (respondedApps.length > 0) {
            const totalDays = respondedApps.reduce((acc, app) => {
                const diff = new Date(app.updatedAt).getTime() - new Date(app.createdAt).getTime();
                return acc + diff / (1000 * 60 * 60 * 24);
            }, 0);
            avgResponseTime = Math.round(totalDays / respondedApps.length);
        }

        // AI Score analytics
        const scoredApps = recentApps.filter(a => a.aiScore !== null);
        const avgAIScore = scoredApps.length > 0 
            ? Math.round(scoredApps.reduce((acc, a) => acc + (a.aiScore || 0), 0) / scoredApps.length) 
            : 0;
        const passingScores = scoredApps.filter(a => (a.aiScore || 0) >= 60).length;
        const passRate = scoredApps.length > 0 ? Math.round((passingScores / scoredApps.length) * 100) : 0;

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
            statusBreakdown: statusBreakdown.map(s => ({ status: s.status, count: s._count.status })),
            departments: departmentStats,
            deadlines: upcomingDeadlines
        });
    } catch (error) {
        console.error("Analytics API error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}