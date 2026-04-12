import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

function getRangeStart(range: string, from?: string): Date {
    const now = new Date();
    if (range === "all") return new Date(0);
    if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === "week") {
        const d = new Date(now);
        d.setDate(now.getDate() - now.getDay());
        d.setHours(0, 0, 0, 0);
        return d;
    }
    if (range === "custom" && from) return new Date(from);
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function GET(req: NextRequest) {
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

        // Get all completed interviews with AI scores in range
        const interviews = await prisma.interview.findMany({
            where: {
                status: "COMPLETED",
                completedAt: { gte: start },
                application: {
                    drive: { orgId },
                    aiScore: { not: null },
                },
            },
            select: {
                application: { select: { aiScore: true } },
            },
        });

        const total = interviews.length;

        // Bucket into 5 bands
        const bands = [
            { label: "0–20",  min: 0,  max: 20,  color: "#EF4444", tier: "Below threshold" },
            { label: "20–40", min: 20, max: 40,  color: "#DC2626", tier: "Below threshold" },
            { label: "40–60", min: 40, max: 60,  color: "#D97706", tier: "Average" },
            { label: "60–80", min: 60, max: 80,  color: "#3B82F6", tier: "Good" },
            { label: "80–100",min: 80, max: 101, color: "#16A34A", tier: "Excellent" },
        ];

        const distribution = bands.map((band) => {
            const count = interviews.filter((iv) => {
                const score = iv.application.aiScore ?? 0;
                return score >= band.min && score < band.max;
            }).length;
            return { ...band, count };
        });

        return NextResponse.json({ total, distribution });
    } catch (error: any) {
        console.error("Score distribution error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
