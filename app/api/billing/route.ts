import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session || !session.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const orgId = session.orgId;
        const { searchParams } = new URL(request.url);
        const trendRange = searchParams.get('trendRange') || 'month';
        const customFrom = searchParams.get('customFrom');
        const customTo = searchParams.get('customTo');
        
        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            include: {
                drives: {
                    where: { isDeleted: false }
                }
            }
        });

        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

        // Fetch interviews for this month
        const thisMonthInterviews = await prisma.interview.findMany({
            where: {
                application: { drive: { orgId } },
                completedAt: { gte: startOfMonth },
                status: "COMPLETED",
                isDeleted: false
            }
        });

        // Fetch interviews for last month
        const lastMonthInterviews = await prisma.interview.findMany({
            where: {
                application: { drive: { orgId } },
                completedAt: { gte: startOfLastMonth, lte: endOfLastMonth },
                status: "COMPLETED",
                isDeleted: false
            }
        });

        const activeDrivesCount = org.drives.length;
        const maxActiveDrivesStr = org.maxActiveDrives === "Unlimited" ? "Unlimited" : parseInt(org.maxActiveDrives);
        
        const thisMonthTimeSec = thisMonthInterviews.reduce((acc, curr) => acc + (curr.interviewDuration || 0), 0);
        const lastMonthTimeSec = lastMonthInterviews.reduce((acc, curr) => acc + (curr.interviewDuration || 0), 0);

        const usageVsLastMonth = lastMonthInterviews.length > 0
            ? Math.round(((thisMonthInterviews.length - lastMonthInterviews.length) / lastMonthInterviews.length) * 100)
            : thisMonthInterviews.length > 0 ? 100 : 0;
            
        const timeVsLastMonth = lastMonthTimeSec > 0
            ? Math.round(((thisMonthTimeSec - lastMonthTimeSec) / lastMonthTimeSec) * 100)
            : thisMonthTimeSec > 0 ? 100 : 0;

        // Generate trend data
        const trendMap = new Map<string, number>();
        let trendInterviews: any[] = [];
        
        if (trendRange === 'today') {
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            for (let i = 0; i < 24; i++) {
                const hourDate = new Date(startOfToday.getTime() + i * 60 * 60 * 1000);
                const hourLabel = hourDate.toLocaleDateString('en-US') + ' ' + hourDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                trendMap.set(hourLabel, 0);
            }
            trendInterviews = await prisma.interview.findMany({
                where: { application: { drive: { orgId } }, completedAt: { gte: startOfToday }, status: "COMPLETED", isDeleted: false }
            });
            trendInterviews.forEach(inv => {
                if (inv.completedAt) {
                    const d = new Date(inv.completedAt);
                    d.setMinutes(0, 0, 0);
                    const hourLabel = d.toLocaleDateString('en-US') + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    if (trendMap.has(hourLabel)) trendMap.set(hourLabel, trendMap.get(hourLabel)! + 1);
                }
            });
        } else if (trendRange === 'week') {
            const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
            let d = new Date(startOfWeek);
            while (d <= now) {
                trendMap.set(d.toISOString().split('T')[0], 0);
                d.setDate(d.getDate() + 1);
            }
            trendInterviews = await prisma.interview.findMany({
                where: { application: { drive: { orgId } }, completedAt: { gte: startOfWeek }, status: "COMPLETED", isDeleted: false }
            });
            trendInterviews.forEach(inv => {
                if (inv.completedAt) {
                    const dateKey = new Date(inv.completedAt).toISOString().split('T')[0];
                    if (trendMap.has(dateKey)) trendMap.set(dateKey, trendMap.get(dateKey)! + 1);
                }
            });
        } else if (trendRange === 'custom' && customFrom && customTo) {
            const startDate = new Date(customFrom + "T00:00:00");
            const endDate = new Date(customTo + "T23:59:59");
            
            const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (diffDays <= 1) {
                for (let i = 0; i < 24; i++) {
                    const hourDate = new Date(startDate.getTime() + i * 60 * 60 * 1000);
                    const hourLabel = hourDate.toLocaleDateString('en-US') + ' ' + hourDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    trendMap.set(hourLabel, 0);
                }
                trendInterviews = await prisma.interview.findMany({
                    where: { application: { drive: { orgId } }, completedAt: { gte: startDate, lte: endDate }, status: "COMPLETED", isDeleted: false }
                });
                trendInterviews.forEach(inv => {
                    if (inv.completedAt) {
                        const dt = new Date(inv.completedAt);
                        dt.setMinutes(0, 0, 0);
                        const hourLabel = dt.toLocaleDateString('en-US') + ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        if (trendMap.has(hourLabel)) trendMap.set(hourLabel, trendMap.get(hourLabel)! + 1);
                    }
                });
            } else {
                let d = new Date(startDate);
                while (d <= endDate) {
                    trendMap.set(d.toISOString().split('T')[0], 0);
                    d.setDate(d.getDate() + 1);
                }
                trendInterviews = await prisma.interview.findMany({
                    where: { application: { drive: { orgId } }, completedAt: { gte: startDate, lte: endDate }, status: "COMPLETED", isDeleted: false }
                });
                trendInterviews.forEach(inv => {
                    if (inv.completedAt) {
                        const dateKey = new Date(inv.completedAt).toISOString().split('T')[0];
                        if (trendMap.has(dateKey)) trendMap.set(dateKey, trendMap.get(dateKey)! + 1);
                    }
                });
            }
        } else {
            // Default to month (or all)
            let d = new Date(startOfMonth);
            while (d <= now) {
                trendMap.set(d.toISOString().split('T')[0], 0);
                d.setDate(d.getDate() + 1);
            }
            thisMonthInterviews.forEach(interview => {
                if (interview.completedAt) {
                    const dateKey = new Date(interview.completedAt).toISOString().split('T')[0];
                    if (trendMap.has(dateKey)) {
                        trendMap.set(dateKey, trendMap.get(dateKey)! + 1);
                    }
                }
            });
        }

        const trend = Array.from(trendMap.entries()).map(([date, count]) => ({ date, count }));

        // Use actual organization quota fields for interviews completed card
        const interviewsTotal = org.interviewQuotaTotal || 300;
        const interviewsUsed = org.interviewQuotaUsed || 0;

        return NextResponse.json({
            plan: {
                name: org.plan || "Starter",
                price: org.plan.toLowerCase().includes("scale") ? 699 : 0,
                interviewsTotal,
                interviewsUsed,
                maxActiveDrives: maxActiveDrivesStr,
                billingCycle: "Monthly",
                nextBillingDate: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
            },
            usage: {
                activeDrives: activeDrivesCount,
                totalInterviewTime: thisMonthTimeSec, 
                interviewsCompleted: interviewsUsed, // Send actual quota used
                usageVsLastMonth,
                timeVsLastMonth,
                trend,
            }
        });
    } catch (error) {
        console.error("Billing overview error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
