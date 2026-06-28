import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdminRole } from "@/lib/auth";

// Returns aggregated test billing metrics per org for super-admin billing page
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const orgId = searchParams.get("orgId");
        if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

        const testInterviews = await prisma.interview.findMany({
            where: {
                isTest: true,
                isDeleted: false,
                application: { drive: { orgId } },
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
                        drive: { select: { title: true, role: true } },
                    },
                },
            },
            orderBy: { updatedAt: "desc" },
            take: 100,
        });

        let totalLlm = 0, totalTts = 0, totalStt = 0, totalCost = 0;

        const rows = testInterviews.map((iv) => {
            const m = (iv.testBillingMetrics && typeof iv.testBillingMetrics === "object")
                ? iv.testBillingMetrics as Record<string, number>
                : {};
            const llm = Number(m.llmCost ?? 0);
            const tts = Number(m.ttsCost ?? 0);
            const stt = Number(m.sttCost ?? 0);
            const cost = llm + tts + stt;
            totalLlm += llm; totalTts += tts; totalStt += stt; totalCost += cost;

            const durationSec = Number(iv.interviewDuration ?? 0);
            return {
                id: iv.id,
                candidate: iv.application?.fullName || "Unknown",
                drive: iv.application?.drive?.role || iv.application?.drive?.title || "—",
                date: (iv.completedAt ?? iv.updatedAt).toISOString(),
                duration: durationSec ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : "—",
                llmCost: llm,
                ttsCost: tts,
                sttCost: stt,
                totalCost: cost,
            };
        });

        return NextResponse.json({
            rows,
            totals: { llmCost: totalLlm, ttsCost: totalTts, sttCost: totalStt, totalCost },
            count: testInterviews.length,
        });
    } catch (e) {
        console.error("[TEST_BILLING]", e);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
