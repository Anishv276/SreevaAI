import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        const [
            totalOrgs,
            activeOrgs,
            suspendedOrgs,
            closedOrgs,
            counts,
            orgCreditStats,
            orgInterviewStats,
            recentActivity,
            trends,
        ] = await Promise.all([
            prisma.organization.count(),
            prisma.organization.count({ where: { status: "ACTIVE" } }),
            prisma.organization.count({ where: { status: "SUSPENDED" } }),
            prisma.organization.count({ where: { status: "CLOSED" } }),
            prisma.$queryRaw<Array<{
                totalAdmins: number;
                totalDrives: number;
                totalCandidates: number;
                totalShortlisted: number;
                totalInterviewed: number;
                totalHired: number;
                totalInterviewQuotaAllocated: number;
                totalInterviewQuotaConsumed: number;
                totalCreditsUsed: number;
            }>>`
                SELECT
                    (SELECT COUNT(*)::INT FROM "User") AS "totalAdmins",
                    (SELECT COUNT(*)::INT FROM "Drive") AS "totalDrives",
                    (SELECT COUNT(*)::INT FROM "Application") AS "totalCandidates",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "resumeStatus" = 'shortlisted') AS "totalShortlisted",
                    (SELECT COUNT(*)::INT FROM "Interview" WHERE "status" = 'COMPLETED') AS "totalInterviewed",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "hiringStatus" = 'hired') AS "totalHired",
                    COALESCE(SUM("interviewQuotaTotal"), 0)::INT AS "totalInterviewQuotaAllocated",
                    COALESCE(SUM("interviewQuotaUsed"), 0)::INT AS "totalInterviewQuotaConsumed",
                    COALESCE(SUM(COALESCE("creditsUsed", 0)), 0)::FLOAT AS "totalCreditsUsed"
                FROM "Organization"
            `,
            // Credit stats: top 4 + "Other" bucket
            prisma.$queryRaw<Array<{ name: string; creditsUsed: number }>>`
                SELECT name, COALESCE("creditsUsed", 0) AS "creditsUsed"
                FROM "Organization"
                ORDER BY "creditsUsed" DESC
                LIMIT 5
            `,
            // Interview stats: top 4 + "Other" bucket
            prisma.$queryRaw<Array<{ name: string; count: number }>>`
                SELECT o.name, COUNT(i.id)::INT AS count
                FROM "Organization" o
                JOIN "Drive" d ON d."orgId" = o.id
                JOIN "Application" a ON a."driveId" = d.id
                JOIN "Interview" i ON i."applicationId" = a.id
                GROUP BY o.name
                ORDER BY count DESC
                LIMIT 5
            `,
            prisma.$queryRaw<Array<{ type: string; detail: string; org: string; at: Date }>>`
                (SELECT 'ORG' AS type, name AS detail, '' AS org, "createdAt" AS at FROM "Organization")
                UNION ALL
                (SELECT 'DRIVE' AS type, title AS detail,
                    (SELECT name FROM "Organization" o WHERE o.id = d."orgId") AS org,
                    "createdAt" AS at FROM "Drive" d)
                UNION ALL
                (SELECT 'CANDIDATE' AS type, "fullName" AS detail,
                    (SELECT name FROM "Organization" o JOIN "Drive" d2 ON d2."orgId" = o.id WHERE d2.id = a."driveId") AS org,
                    "createdAt" AS at FROM "Application" a)
                UNION ALL
                (SELECT 'INTERVIEW' AS type, 'Completed' AS detail,
                    (SELECT name FROM "Organization" o JOIN "Drive" d3 ON d3."orgId" = o.id JOIN "Application" a2 ON a2."driveId" = d3.id WHERE a2.id = i."applicationId") AS org,
                    "completedAt" AS at FROM "Interview" i WHERE i."status" = 'COMPLETED' AND i."completedAt" IS NOT NULL)
                ORDER BY at DESC
                LIMIT 10
            `,
            prisma.$queryRaw<Array<{
                orgsNew: number; orgsPrev: number;
                adminsNew: number; adminsPrev: number;
                drivesNew: number; drivesPrev: number;
                candidatesNew: number; candidatesPrev: number;
            }>>`
                SELECT
                    (SELECT COUNT(*)::INT FROM "Organization" WHERE "createdAt" >= ${lastWeek}) AS "orgsNew",
                    (SELECT COUNT(*)::INT FROM "Organization" WHERE "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) AS "orgsPrev",
                    (SELECT COUNT(*)::INT FROM "User" WHERE "createdAt" >= ${lastWeek}) AS "adminsNew",
                    (SELECT COUNT(*)::INT FROM "User" WHERE "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) AS "adminsPrev",
                    (SELECT COUNT(*)::INT FROM "Drive" WHERE "createdAt" >= ${lastWeek}) AS "drivesNew",
                    (SELECT COUNT(*)::INT FROM "Drive" WHERE "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) AS "drivesPrev",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "createdAt" >= ${lastWeek}) AS "candidatesNew",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) AS "candidatesPrev"
            `,
        ]);

        const calc = (curr: number, prev: number) =>
            prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

        const t = trends[0] || {};
        const c = counts[0] || {};

        // Build "Other" bucket for credit stats
        const totalCredits = orgCreditStats.reduce((s, o) => s + Number(o.creditsUsed), 0);
        const top4Credits = orgCreditStats.slice(0, 4);
        const otherCredits = totalCredits - top4Credits.reduce((s, o) => s + Number(o.creditsUsed), 0);
        const creditStatsWithOther = [
            ...top4Credits.map((o) => ({ name: o.name, creditsUsed: Number(o.creditsUsed) })),
            ...(otherCredits > 0 ? [{ name: "Other", creditsUsed: otherCredits }] : []),
        ];

        // Build "Other" bucket for interview stats
        const totalIVs = orgInterviewStats.reduce((s, o) => s + Number(o.count), 0);
        const top4IVs = orgInterviewStats.slice(0, 4);
        const otherIVs = totalIVs - top4IVs.reduce((s, o) => s + Number(o.count), 0);
        const ivStatsWithOther = [
            ...top4IVs.map((o) => ({ name: o.name, count: Number(o.count) })),
            ...(otherIVs > 0 ? [{ name: "Other", count: otherIVs }] : []),
        ];

        return NextResponse.json({
            totalOrgs,
            activeOrgs,
            suspendedOrgs,
            closedOrgs,
            totalAdmins: Number(c.totalAdmins || 0),
            totalDrives: Number(c.totalDrives || 0),
            totalCandidates: Number(c.totalCandidates || 0),
            totalShortlisted: Number(c.totalShortlisted || 0),
            totalInterviewed: Number(c.totalInterviewed || 0),
            totalHired: Number(c.totalHired || 0),
            totalInterviewQuotaAllocated: Number(c.totalInterviewQuotaAllocated || 0),
            totalInterviewQuotaConsumed: Number(c.totalInterviewQuotaConsumed || 0),
            totalCreditsUsed: Number(c.totalCreditsUsed || 0),
            orgCreditStats: creditStatsWithOther,
            orgInterviewStats: ivStatsWithOther,
            recentActivity,
            trends: {
                orgs:       calc(Number(t.orgsNew), Number(t.orgsPrev)),
                admins:     calc(Number(t.adminsNew), Number(t.adminsPrev)),
                drives:     calc(Number(t.drivesNew), Number(t.drivesPrev)),
                candidates: calc(Number(t.candidatesNew), Number(t.candidatesPrev)),
            },
        }, {
            headers: { "Cache-Control": "private, max-age=60" },
        });
    } catch (error: any) {
        console.error("super-admin stats error:", error);
        return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
    }
}
