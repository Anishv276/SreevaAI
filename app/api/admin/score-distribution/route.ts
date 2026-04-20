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

        // -- DB BUCKETING: Score Distribution ---------------
        const scoreGroups = await prisma.$queryRawUnsafe<any[]>(`
            SELECT 
                CASE 
                    WHEN a."aiScore" < 20 THEN '0–20'
                    WHEN a."aiScore" < 40 THEN '20–40'
                    WHEN a."aiScore" < 60 THEN '40–60'
                    WHEN a."aiScore" < 80 THEN '60–80'
                    ELSE '80–100'
                END as label,
                COUNT(*)::INT as count
            FROM "Interview" iv
            JOIN "Application" a ON iv."applicationId" = a."id"
            JOIN "Drive" d ON a."driveId" = d."id"
            WHERE d."orgId" = $1 
              AND iv."status" = 'COMPLETED'
              AND iv."completedAt" >= $2
              AND a."aiScore" IS NOT NULL
            GROUP BY label
        `, orgId, start);

        const bands = [
            { label: "0–20",  min: 0,  max: 20,  color: "#EF4444", tier: "Below threshold" },
            { label: "20–40", min: 20, max: 40,  color: "#DC2626", tier: "Below threshold" },
            { label: "40–60", min: 40, max: 60,  color: "#D97706", tier: "Average" },
            { label: "60–80", min: 60, max: 80,  color: "#3B82F6", tier: "Good" },
            { label: "80–100",min: 80, max: 101, color: "#16A34A", tier: "Excellent" },
        ];

        let total = 0;
        const distribution = bands.map((band) => {
            const match = scoreGroups.find(g => g.label === band.label);
            const count = match ? match.count : 0;
            total += count;
            return { ...band, count };
        });

        return NextResponse.json({ total, distribution });
    } catch (error: any) {
        console.error("Score distribution error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
