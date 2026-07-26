import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";
import { synthesizedPlanBilling } from "@/lib/org-plans";
import { aggregateOrgUsageEvents } from "@/lib/usage-metrics";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) {
            return NextResponse.json({ error: "Unauthorized", session }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const orgId = searchParams.get("orgId");
        const trendRange = searchParams.get('trendRange') || 'month';
        const customFrom = searchParams.get('customFrom');
        const customTo = searchParams.get('customTo');

        if (!orgId) {
            return NextResponse.json({ error: "orgId required" }, { status: 400 });
        }
        if (session.role !== "SUPER_ADMIN" && orgId !== session.orgId) {
            return NextResponse.json({ error: "Access Denied: Ownership required" }, { status: 403 });
        }

        const org = await prisma.organizationDetails.findUnique({
            where: { id: orgId },
            include: {
                jobs: {
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

        const thisMonthInterviews = await prisma.interview.findMany({
            where: {
                application: { isDeleted: false, job: { organizationId: orgId, isDeleted: false } },
                interviewCompletedAt: { gte: startOfMonth },
                interviewStatus: "COMPLETED",
                isDeleted: false
            }
        });

        const lastMonthInterviews = await prisma.interview.findMany({
            where: {
                application: { isDeleted: false, job: { organizationId: orgId, isDeleted: false } },
                interviewCompletedAt: { gte: startOfLastMonth, lte: endOfLastMonth },
                interviewStatus: "COMPLETED",
                isDeleted: false
            }
        });

        const activeJobsCount = org.jobs.length;
        const maxActiveJobsStr = org.maxActiveJobs === "Unlimited" ? "Unlimited" : parseInt(org.maxActiveJobs);

        const thisMonthTimeSec = thisMonthInterviews.reduce((acc, curr) => acc + (curr.durationInSeconds || 0), 0);
        const lastMonthTimeSec = lastMonthInterviews.reduce((acc, curr) => acc + (curr.durationInSeconds || 0), 0);

        const usageVsLastMonth = lastMonthInterviews.length > 0
            ? Math.round(((thisMonthInterviews.length - lastMonthInterviews.length) / lastMonthInterviews.length) * 100)
            : thisMonthInterviews.length > 0 ? 100 : 0;

        const timeVsLastMonth = lastMonthTimeSec > 0
            ? Math.round(((thisMonthTimeSec - lastMonthTimeSec) / lastMonthTimeSec) * 100)
            : thisMonthTimeSec > 0 ? 100 : 0;

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
                where: { application: { isDeleted: false, job: { organizationId: orgId, isDeleted: false } }, interviewCompletedAt: { gte: startOfToday }, interviewStatus: "COMPLETED", isDeleted: false }
            });
            trendInterviews.forEach(inv => {
                if (inv.interviewCompletedAt) {
                    const d = new Date(inv.interviewCompletedAt);
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
                where: { application: { isDeleted: false, job: { organizationId: orgId, isDeleted: false } }, interviewCompletedAt: { gte: startOfWeek }, interviewStatus: "COMPLETED", isDeleted: false }
            });
            trendInterviews.forEach(inv => {
                if (inv.interviewCompletedAt) {
                    const dateKey = new Date(inv.interviewCompletedAt).toISOString().split('T')[0];
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
                    where: { application: { isDeleted: false, job: { organizationId: orgId, isDeleted: false } }, interviewCompletedAt: { gte: startDate, lte: endDate }, interviewStatus: "COMPLETED", isDeleted: false }
                });
                trendInterviews.forEach(inv => {
                    if (inv.interviewCompletedAt) {
                        const dt = new Date(inv.interviewCompletedAt);
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
                    where: { application: { isDeleted: false, job: { organizationId: orgId, isDeleted: false } }, interviewCompletedAt: { gte: startDate, lte: endDate }, interviewStatus: "COMPLETED", isDeleted: false }
                });
                trendInterviews.forEach(inv => {
                    if (inv.interviewCompletedAt) {
                        const dateKey = new Date(inv.interviewCompletedAt).toISOString().split('T')[0];
                        if (trendMap.has(dateKey)) trendMap.set(dateKey, trendMap.get(dateKey)! + 1);
                    }
                });
            }
        } else {
            let d = new Date(startOfMonth);
            while (d <= now) {
                trendMap.set(d.toISOString().split('T')[0], 0);
                d.setDate(d.getDate() + 1);
            }
            thisMonthInterviews.forEach(interview => {
                if (interview.interviewCompletedAt) {
                    const dateKey = new Date(interview.interviewCompletedAt).toISOString().split('T')[0];
                    if (trendMap.has(dateKey)) {
                        trendMap.set(dateKey, trendMap.get(dateKey)! + 1);
                    }
                }
            });
        }

        const trend = Array.from(trendMap.entries()).map(([date, count]) => ({ date, count }));

        const interviewsTotal = org.totalInterviewsAllowed || 300;
        const interviewsUsed = org.totalInterviewsUsed || 0;

        // Build consumption hub from the UsageEvent ledger (real spend only).
        const entityRows = await prisma.usageEvent.findMany({
            where: { organizationId: orgId, isTest: false },
            select: { feature: true, usage: true },
        });
        const agg = aggregateOrgUsageEvents(entityRows);
        // Map the shared aggregate onto the hub's per-feature shape. The interview
        // TTS/STT rolls up under the "interview" feature (as it did in the blob).
        const feat = (a: typeof agg.eval, tts?: typeof agg.interviewTts, stt?: typeof agg.interviewStt) => ({
            runs:            a.calls,
            inputTokens:     a.inputTokens,
            outputTokens:    a.outputTokens,
            costUsd:         a.costUsd,
            ttsCharacters:   tts?.ttsCharacters ?? 0,
            ttsCostUsd:      tts?.costUsd ?? 0,
            sttAudioSeconds: stt?.sttAudioSeconds ?? 0,
            sttCostUsd:      stt?.costUsd ?? 0,
            byModel:         a.byModel,
            ttsByModel:      tts?.byModel ?? {},
            sttByModel:      stt?.byModel ?? {},
        });
        const consumptionHub: Record<string, any> = {
            interview:              feat(agg.eval, agg.interviewTts, agg.interviewStt),
            questionBank:           feat(agg.questionBank),
            interviewLLMGeneration: feat(agg.llmGeneration),
            interviewReport:        feat(agg.report),
            resumeExtraction:       feat(agg.resumeExtraction),
            jdExtraction:           feat(agg.jdExtraction),
            resumeReport:           feat(agg.resumeReport),
        };
        const totalLlmCost = Object.values(consumptionHub).reduce(
            (s, f) => s + Number(f?.costUsd || 0), 0
        );
        const totalTtsCost = Number(consumptionHub.interview?.ttsCostUsd || 0);
        const totalSttCost = Number(consumptionHub.interview?.sttCostUsd || 0);

        return NextResponse.json({
            plan: (() => {
                // Prefer stored subscription fields (super-admin editable); fall back
                // to the synthesized values for orgs predating those columns.
                const synth = synthesizedPlanBilling(org.billingPlan, now);
                return {
                    name: org.billingPlan || "Starter",
                    price: org.planPriceUsd ?? synth.priceUsd,
                    interviewsTotal,
                    interviewsUsed,
                    maxActiveJobs: maxActiveJobsStr,
                    billingCycle: org.billingCycle ?? synth.billingCycle,
                    nextBillingDate: (org.nextBillingDate ?? synth.nextBillingDate).toISOString(),
                };
            })(),
            usage: {
                activeJobs: activeJobsCount,
                totalInterviewTime: thisMonthTimeSec,
                interviewsCompleted: interviewsUsed,
                usageVsLastMonth,
                timeVsLastMonth,
                trend,
            },
            consumptionHub,
            totalCosts: {
                llmCostUsd: Math.round(totalLlmCost * 1e6) / 1e6,
                ttsCostUsd: Math.round(totalTtsCost * 1e6) / 1e6,
                sttCostUsd: Math.round(totalSttCost * 1e6) / 1e6,
                totalCostUsd: Math.round((totalLlmCost + totalTtsCost + totalSttCost) * 1e6) / 1e6,
            },
            billingCreditsUsed: Number(org.billingCreditsUsed || 0),
        });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/super-admin/billing",
            method: "GET",
            error,
            body: { error: "Internal server error" },
            status: 500,
            logLabel: "Super-admin billing error:",
        });
    }
}
