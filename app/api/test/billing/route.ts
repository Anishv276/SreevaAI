import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdminRole } from "@/lib/auth";

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
                isTest: true,
                isDeleted: false,
                application: { job: { orgId } },
            },
            select: {
                id: true,
                completedAt: true,
                updatedAt: true,
                interviewDuration: true,
                testBillingMetrics: true,
                application: {
                    select: {
                        fullName: true,
                        job: { select: { title: true, role: true } },
                    },
                },
            },
            orderBy: { updatedAt: "desc" },
            take: 100,
        });

        let totalLlm = 0, totalTts = 0, totalStt = 0, totalReport = 0, totalCost = 0;

        const rows = testInterviews.map((iv) => {
            const m = (iv.testBillingMetrics && typeof iv.testBillingMetrics === "object")
                ? iv.testBillingMetrics as Record<string, number>
                : {};
            const llm = Number(m.llmCost ?? 0);
            const tts = Number(m.ttsCost ?? 0);
            const stt = Number(m.sttCost ?? 0);
            // reportLlmCost: accumulated separately by billing.record_test_report_billing_usage
            // whenever a test session's report/summary/verdict LLM calls run (report not skipped).
            const report = Number(m.reportLlmCost ?? 0);
            const cost = llm + tts + stt + report;
            totalLlm += llm; totalTts += tts; totalStt += stt; totalReport += report; totalCost += cost;

            const durationSec = Number(iv.interviewDuration ?? 0);
            return {
                id: iv.id,
                candidate: iv.application?.fullName || "Unknown",
                job: iv.application?.job?.role || iv.application?.job?.title || "—",
                date: (iv.completedAt ?? iv.updatedAt).toISOString(),
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
        console.error("[TEST_BILLING]", e);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
