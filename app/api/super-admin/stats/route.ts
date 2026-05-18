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
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [
            totalOrgs,
            counts,
            allOrgStatuses,
            orgCreditStats,
            orgInterviewStats,
            orgQuotaStats,
            recentActivity,
            trends,
            recentlyActiveOrgs,
        ] = await Promise.all([
            prisma.organization.count(),
            // Global counts
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
                    (SELECT COUNT(*)::INT FROM "User" WHERE role = 'ADMIN') AS "totalAdmins",
                    (SELECT COUNT(*)::INT FROM "Drive") AS "totalDrives",
                    (SELECT COUNT(*)::INT FROM "Application") AS "totalCandidates",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE UPPER("resumeStatus") = 'SHORTLISTED') AS "totalShortlisted",
                    (SELECT COUNT(*)::INT FROM "Interview" WHERE "status" = 'COMPLETED') AS "totalInterviewed",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE UPPER("hiringStatus") = 'HIRED') AS "totalHired",
                    COALESCE(SUM("interviewQuotaTotal"), 0)::INT AS "totalInterviewQuotaAllocated",
                    COALESCE(SUM("interviewQuotaUsed"), 0)::INT AS "totalInterviewQuotaConsumed",
                    COALESCE(SUM(COALESCE("creditsUsed", 0)), 0)::FLOAT AS "totalCreditsUsed"
                FROM "Organization"
            `,
            // All orgs with quota data to compute effective statuses
            prisma.$queryRaw<Array<{
                status: string;
                statusControl: string | null;
                interviewQuotaTotal: number | null;
                interviewQuotaUsed: number | null;
            }>>`
                SELECT status, "statusControl", "interviewQuotaTotal", "interviewQuotaUsed"
                FROM "Organization"
            `,
            // Full credit stats (no LIMIT) for accurate "Other" bucket
            prisma.$queryRaw<Array<{ name: string; creditsUsed: number }>>`
                SELECT name, COALESCE("creditsUsed", 0) AS "creditsUsed"
                FROM "Organization"
                ORDER BY "creditsUsed" DESC
            `,
            // Full interview stats (no LIMIT) for accurate "Other" bucket
            prisma.$queryRaw<Array<{ name: string; count: number }>>`
                SELECT o.name, COUNT(i.id)::INT AS count
                FROM "Organization" o
                JOIN "Drive" d ON d."orgId" = o.id
                JOIN "Application" a ON a."driveId" = d.id
                JOIN "Interview" i ON i."applicationId" = a.id
                GROUP BY o.name
                ORDER BY count DESC
            `,
            // Quota consumption per org (for bar chart replacement)
            prisma.$queryRaw<Array<{ name: string; used: number; total: number }>>`
                SELECT name,
                    COALESCE("interviewQuotaUsed", 0)::INT AS used,
                    COALESCE("interviewQuotaTotal", 0)::INT AS total
                FROM "Organization"
                WHERE COALESCE("interviewQuotaTotal", 0) > 0
                ORDER BY (COALESCE("interviewQuotaUsed", 0)::FLOAT / NULLIF(COALESCE("interviewQuotaTotal", 0), 0)) DESC
                LIMIT 8
            `,
            // Recent activity
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
            // Trend comparison (last 7 days vs prior 7 days)
            prisma.$queryRaw<Array<{
                orgsNew: number; orgsPrev: number;
                adminsNew: number; adminsPrev: number;
                drivesNew: number; drivesPrev: number;
                candidatesNew: number; candidatesPrev: number;
            }>>`
                SELECT
                    (SELECT COUNT(*)::INT FROM "Organization" WHERE "createdAt" >= ${lastWeek}) AS "orgsNew",
                    (SELECT COUNT(*)::INT FROM "Organization" WHERE "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) AS "orgsPrev",
                    (SELECT COUNT(*)::INT FROM "User" WHERE role = 'ADMIN' AND "createdAt" >= ${lastWeek}) AS "adminsNew",
                    (SELECT COUNT(*)::INT FROM "User" WHERE role = 'ADMIN' AND "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) AS "adminsPrev",
                    (SELECT COUNT(*)::INT FROM "Drive" WHERE "createdAt" >= ${lastWeek}) AS "drivesNew",
                    (SELECT COUNT(*)::INT FROM "Drive" WHERE "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) AS "drivesPrev",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "createdAt" >= ${lastWeek}) AS "candidatesNew",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) AS "candidatesPrev"
            `,
            // Orgs with at least one completed interview in last 30 days (engagement health)
            prisma.$queryRaw<Array<{ count: number }>>`
                SELECT COUNT(DISTINCT o.id)::INT AS count
                FROM "Organization" o
                JOIN "Drive" d ON d."orgId" = o.id
                JOIN "Application" a ON a."driveId" = d.id
                JOIN "Interview" i ON i."applicationId" = a.id
                WHERE i."status" = 'COMPLETED' AND i."completedAt" >= ${thirtyDaysAgo}
            `,
        ]);

        // Compute effective status counts using same logic as orgs route
        let activeOrgs = 0;
        let suspendedOrgs = 0;
        let closedOrgs = 0;

        for (const org of allOrgStatuses) {
            const status = String(org.status || "ACTIVE").toUpperCase();
            if (status === "CLOSED") { closedOrgs++; continue; }
            const statusControl = String(org.statusControl || "").toUpperCase();
            if (statusControl === "MANUAL") { suspendedOrgs++; continue; }
            const total = Math.max(0, Number(org.interviewQuotaTotal || 0));
            const used = Math.max(0, Number(org.interviewQuotaUsed || 0));
            if (total > 0 && used >= total) { suspendedOrgs++; continue; }
            activeOrgs++;
        }

        const calc = (curr: number, prev: number) =>
            prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

        const t = trends[0] || {};
        const c = counts[0] || {};

        // Build top-4 + "Other" for credits (from full dataset)
        const top4Credits = orgCreditStats.slice(0, 4);
        const otherCredits = orgCreditStats.slice(4).reduce((s, o) => s + Number(o.creditsUsed), 0);
        const creditStatsWithOther = [
            ...top4Credits.map((o) => ({ name: o.name, creditsUsed: Number(o.creditsUsed) })),
            ...(otherCredits > 0 ? [{ name: "Other", creditsUsed: otherCredits }] : []),
        ];

        // Build top-4 + "Other" for interviews (from full dataset)
        const top4IVs = orgInterviewStats.slice(0, 4);
        const otherIVs = orgInterviewStats.slice(4).reduce((s, o) => s + Number(o.count), 0);
        const ivStatsWithOther = [
            ...top4IVs.map((o) => ({ name: o.name, count: Number(o.count) })),
            ...(otherIVs > 0 ? [{ name: "Other", count: otherIVs }] : []),
        ];

        // Platform health: composite score
        // 60% weight: % active orgs (effective), 40% weight: % orgs engaged in last 30 days
        const engagedOrgs = Number(recentlyActiveOrgs[0]?.count || 0);
        const engagedPct = totalOrgs > 0 ? (engagedOrgs / totalOrgs) * 100 : 0;
        const activePct = totalOrgs > 0 ? (activeOrgs / totalOrgs) * 100 : 0;
        const platformHealth = Math.round(activePct * 0.6 + engagedPct * 0.4);

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
            orgQuotaStats: orgQuotaStats.map((o) => ({
                name: o.name,
                used: Number(o.used),
                total: Number(o.total),
            })),
            platformHealth,
            engagedOrgs,
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
