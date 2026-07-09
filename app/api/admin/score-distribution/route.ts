import { Prisma } from "@prisma/client";
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
        type ScoreGroupRow = { label: string; count: number };
        const scoreGroups = await prisma.$queryRaw<Array<ScoreGroupRow>>(Prisma.sql`
            SELECT
                CASE
                    WHEN a."aiScore" < 40 THEN '0-39'
                    WHEN a."aiScore" < 60 THEN '40-59'
                    WHEN a."aiScore" < 80 THEN '60-79'
                    ELSE '80-100'
                END AS label,
                COUNT(*)::INT AS count
            FROM "Interview" iv
            JOIN "Application" a ON iv."applicationId" = a."id"
            JOIN "Job" d ON a."jobId" = d."id"
            WHERE d."orgId" = ${orgId}
              AND iv."isDeleted" = false
              AND a."isDeleted" = false
              AND d."isDeleted" = false
              AND iv."status" = 'COMPLETED'
              AND iv."completedAt" >= ${start}
              AND a."aiScore" IS NOT NULL
            GROUP BY label
        `);
        const bands = [
            { label: "0-39", min: 0, max: 39, color: "#EF4444", tier: "Below (0-39)" },
            { label: "40-59", min: 40, max: 59, color: "#F59E0B", tier: "Average (40-59)" },
            { label: "60-79", min: 60, max: 79, color: "#3B82F6", tier: "Good (60-79)" },
            { label: "80-100", min: 80, max: 100, color: "#8B5CF6", tier: "Excellent (80-100)" },
        ];
        let total = 0;
        const distribution = bands.map((band) => {
            const match = scoreGroups.find((g) => g.label === band.label);
            const count = match ? match.count : 0;
            total += count;
            return { ...band, count };
        });
        return NextResponse.json({ total, distribution });
    } catch (error: unknown) {
        console.error("Score distribution error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to load score distribution" },
            { status: 500 }
        );
    }
}
