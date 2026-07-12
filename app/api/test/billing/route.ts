import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdminRole } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

// Returns aggregated test billing metrics per org for super-admin billing page
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session || !isSuperAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { searchParams } = new URL(request.url);
        const orgId = searchParams.get("orgId");
        if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

        const testInterviews = await prisma.interview.findMany({
            where: {
                isTestSession: true,
                isDeleted: false,
                application: { job: { organizationId: orgId } },
            },
            select: {
                id: true,
                interviewCompletedAt: true,
                interviewUpdatedAt: true,
                durationInSeconds: true,
                testSessionBillingMetrics: true,
                application: {
                    select: {
                        candidateFullName: true,
                        job: { select: { title: true, jobRole: true } },
                    },
                },
            },
            orderBy: { interviewUpdatedAt: "desc" },
            take: 100,
        });

        let totalLlm = 0, totalTts = 0, totalStt = 0, totalReport = 0, totalCost = 0;

        const rows = testInterviews.map((iv) => {
            const m = (iv.testSessionBillingMetrics && typeof iv.testSessionBillingMetrics === "object")
                ? iv.testSessionBillingMetrics as Record<string, number>
                : {};
            const llm = Number(m.llmCost ?? 0);
            const tts = Number(m.ttsCost ?? 0);
            const stt = Number(m.sttCost ?? 0);
            // reportLlmCost: accumulated separately by billing.record_test_report_billing_usage
            // whenever a test session's report/summary/verdict LLM calls run (report not skipped).
            const report = Number(m.reportLlmCost ?? 0);
            const cost = llm + tts + stt + report;
            totalLlm += llm; totalTts += tts; totalStt += stt; totalReport += report; totalCost += cost;

            const durationSec = Number(iv.durationInSeconds ?? 0);
            return {
                id: iv.id,
                candidate: iv.application?.candidateFullName || "Unknown",
                job: iv.application?.job?.jobRole || iv.application?.job?.title || "—",
                date: (iv.interviewCompletedAt ?? iv.interviewUpdatedAt).toISOString(),
                duration: durationSec ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : "—",
                llmCost: llm,
                ttsCost: tts,
                sttCost: stt,
                reportCost: report,
                reportEnabled: !m.skipReport,
                totalCost: cost,
            };
        });

        return NextResponse.json({
            rows,
            totals: { llmCost: totalLlm, ttsCost: totalTts, sttCost: totalStt, reportCost: totalReport, totalCost },
            count: testInterviews.length,
        });
    } catch (e) {
        return apiErrorResponse({
            route: "/api/test/billing",
            method: "GET",
            error: e,
            body: { error: "Failed" },
            status: 500,
            logLabel: "[TEST_BILLING]",
        });
    }
}
