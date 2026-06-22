import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
type OrgStatusRow = {
    status: string;
    statusControl: string | null;
    interviewQuotaTotal: number | null;
    interviewQuotaUsed: number | null;
};
type CreditRow = { name: string; creditsUsed: number };
type InterviewRow = { name: string; count: number };
type RecentActivityRow = { type: string; detail: string; org: string; at: Date };
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
            creditTopRows,
            creditTotalRows,
            interviewTopRows,
            interviewTotalRows,
            orgQuotaStats,
            recentActivity,
            trends,
            recentlyActiveOrgs,
        ] = await Promise.all([
            prisma.organization.count(),
            prisma.$queryRaw<Array<{
                totalAdmins: number;
                totalDrives: number;
                totalCandidates: number;
                totalShortlisted: number;
                totalInterviewed: number;
                totalInterviewQuotaAllocated: number;
                totalInterviewQuotaConsumed: number;
                totalCreditsUsed: number;
            }>>`
                SELECT
                    (SELECT COUNT(*)::INT FROM "SuperAdmin" WHERE "isDeleted" = false) AS "totalAdmins",
                    (SELECT COUNT(*)::INT FROM "Drive" WHERE "isDeleted" = false) AS "totalDrives",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "isDeleted" = false) AS "totalCandidates",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "isDeleted" = false AND UPPER("resumeStatus") = 'SHORTLISTED') AS "totalShortlisted",
                    (SELECT COUNT(*)::INT FROM "Interview" WHERE "isDeleted" = false AND "status" = 'COMPLETED') AS "totalInterviewed",
                    COALESCE(SUM("interviewQuotaTotal"), 0)::INT AS "totalInterviewQuotaAllocated",
                    COALESCE(SUM("interviewQuotaUsed"), 0)::INT AS "totalInterviewQuotaConsumed",
                    COALESCE(SUM(COALESCE("creditsUsed", 0)), 0)::FLOAT AS "totalCreditsUsed"
                FROM "Organization" WHERE "isDeleted" = false
            `,
            prisma.$queryRaw<Array<OrgStatusRow>>`
                SELECT status, "statusControl", "interviewQuotaTotal", "interviewQuotaUsed"
                FROM "Organization"
                WHERE "isDeleted" = false
            `,
            prisma.$queryRaw<Array<CreditRow>>(Prisma.sql`
                SELECT name, COALESCE("creditsUsed", 0)::FLOAT AS "creditsUsed"
                FROM "Organization"
                WHERE "isDeleted" = false
                ORDER BY COALESCE("creditsUsed", 0) DESC, name ASC
                LIMIT 4
            `),
            prisma.$queryRaw<Array<{ totalCreditsUsed: number }>>(Prisma.sql`
                SELECT COALESCE(SUM(COALESCE("creditsUsed", 0)), 0)::FLOAT AS "totalCreditsUsed"
                FROM "Organization"
                WHERE "isDeleted" = false
            `),
            prisma.$queryRaw<Array<InterviewRow>>(Prisma.sql`
                SELECT o.name, COUNT(i.id)::INT AS count
                FROM "Organization" o
                JOIN "Drive" d ON d."orgId" = o.id
                JOIN "Application" a ON a."driveId" = d.id
                JOIN "Interview" i ON i."applicationId" = a.id
                WHERE o."isDeleted" = false AND d."isDeleted" = false AND a."isDeleted" = false AND i."isDeleted" = false
                GROUP BY o.id, o.name
                ORDER BY COUNT(i.id) DESC, o.name ASC
                LIMIT 4
            `),
            prisma.$queryRaw<Array<{ totalInterviews: number }>>(Prisma.sql`
                SELECT COUNT(i.id)::INT AS "totalInterviews"
                FROM "Organization" o
                JOIN "Drive" d ON d."orgId" = o.id
                JOIN "Application" a ON a."driveId" = d.id
                JOIN "Interview" i ON i."applicationId" = a.id
                WHERE o."isDeleted" = false AND d."isDeleted" = false AND a."isDeleted" = false AND i."isDeleted" = false
            `),
            prisma.$queryRaw<Array<{ name: string; used: number; total: number }>>`
                SELECT name,
                    COALESCE("interviewQuotaUsed", 0)::INT AS used,
                    COALESCE("interviewQuotaTotal", 0)::INT AS total
                FROM "Organization"
                WHERE "isDeleted" = false AND COALESCE("interviewQuotaTotal", 0) > 0
                ORDER BY (COALESCE("interviewQuotaUsed", 0)::FLOAT / NULLIF(COALESCE("interviewQuotaTotal", 0), 0)) DESC
                LIMIT 8
            `,
            prisma.$queryRaw<Array<RecentActivityRow>>(Prisma.sql`
                SELECT * FROM (
                    SELECT * FROM (
                        SELECT 'ORG'::text AS type, o.name AS detail, ''::text AS org, o."createdAt" AS at
                        FROM "Organization" o
                        WHERE o."isDeleted" = false
                        ORDER BY o."createdAt" DESC
                        LIMIT 10
                    ) org_activity
                    UNION ALL
                    SELECT * FROM (
                        SELECT 'DRIVE'::text AS type, d.title AS detail, COALESCE(o.name, '')::text AS org, d."createdAt" AS at
                        FROM "Drive" d
                        LEFT JOIN "Organization" o ON o.id = d."orgId"
                        WHERE d."isDeleted" = false
                        ORDER BY d."createdAt" DESC
                        LIMIT 10
                    ) drive_activity
                    UNION ALL
                    SELECT * FROM (
                        SELECT 'CANDIDATE'::text AS type, a."fullName" AS detail, COALESCE(o.name, '')::text AS org, a."createdAt" AS at
                        FROM "Application" a
                        LEFT JOIN "Drive" d ON d.id = a."driveId"
                        LEFT JOIN "Organization" o ON o.id = d."orgId"
                        WHERE a."isDeleted" = false
                        ORDER BY a."createdAt" DESC
                        LIMIT 10
                    ) candidate_activity
                    UNION ALL
                    SELECT * FROM (
                        SELECT 'INTERVIEW'::text AS type, 'Completed'::text AS detail, COALESCE(o.name, '')::text AS org, i."completedAt" AS at
                        FROM "Interview" i
                        JOIN "Application" a ON a.id = i."applicationId"
                        LEFT JOIN "Drive" d ON d.id = a."driveId"
                        LEFT JOIN "Organization" o ON o.id = d."orgId"
                        WHERE i."isDeleted" = false AND a."isDeleted" = false AND i."status" = 'COMPLETED' AND i."completedAt" IS NOT NULL
                        ORDER BY i."completedAt" DESC
                        LIMIT 10
                    ) interview_activity
                ) activity_feed
                ORDER BY at DESC
                LIMIT 10
            `),
            prisma.$queryRaw<Array<{
                orgsNew: number;
                orgsPrev: number;
                adminsNew: number;
                adminsPrev: number;
                drivesNew: number;
                drivesPrev: number;
                candidatesNew: number;
                candidatesPrev: number;
            }>>`
                SELECT
                    (SELECT COUNT(*)::INT FROM "Organization" WHERE "isDeleted" = false AND "createdAt" >= ${lastWeek}) AS "orgsNew",
                    (SELECT COUNT(*)::INT FROM "Organization" WHERE "isDeleted" = false AND "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) AS "orgsPrev",
                    (SELECT COUNT(*)::INT FROM "SuperAdmin" WHERE "isDeleted" = false AND "createdAt" >= ${lastWeek}) AS "adminsNew",
                    (SELECT COUNT(*)::INT FROM "SuperAdmin" WHERE "isDeleted" = false AND "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) AS "adminsPrev",
                    (SELECT COUNT(*)::INT FROM "Drive" WHERE "isDeleted" = false AND "createdAt" >= ${lastWeek}) AS "drivesNew",
                    (SELECT COUNT(*)::INT FROM "Drive" WHERE "isDeleted" = false AND "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) AS "drivesPrev",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "isDeleted" = false AND "createdAt" >= ${lastWeek}) AS "candidatesNew",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "isDeleted" = false AND "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) AS "candidatesPrev"
            `,
            prisma.$queryRaw<Array<{ count: number }>>`
                SELECT COUNT(DISTINCT o.id)::INT AS count
                FROM "Organization" o
                JOIN "Drive" d ON d."orgId" = o.id
                JOIN "Application" a ON a."driveId" = d.id
                JOIN "Interview" i ON i."applicationId" = a.id
                WHERE o."isDeleted" = false AND d."isDeleted" = false AND a."isDeleted" = false AND i."isDeleted" = false AND i."status" = 'COMPLETED' AND i."completedAt" >= ${thirtyDaysAgo}
            `,
        ]);
        let activeOrgs = 0;
        let suspendedOrgs = 0;
        let closedOrgs = 0;
        for (const org of allOrgStatuses) {
            const status = String(org.status || "ACTIVE").toUpperCase();
            if (status === "CLOSED") {
                closedOrgs++;
                continue;
            }
            const statusControl = String(org.statusControl || "").toUpperCase();
            if (statusControl === "MANUAL") {
                suspendedOrgs++;
                continue;
            }
            const total = Math.max(0, Number(org.interviewQuotaTotal || 0));
            const used = Math.max(0, Number(org.interviewQuotaUsed || 0));
            if (total > 0 && used >= total) {
                suspendedOrgs++;
                continue;
            }
            activeOrgs++;
        }
        const calc = (curr: number, prev: number) =>
            prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);
        const t = trends[0] || {};
        const c = counts[0] || {};
        const creditTotal = Number(creditTotalRows[0]?.totalCreditsUsed || 0);
        const top4Credits = creditTopRows.slice(0, 4);
        const otherCredits = Math.max(
            0,
            creditTotal - top4Credits.reduce((sum, row) => sum + Number(row.creditsUsed || 0), 0)
        );
        const creditStatsWithOther = [
            ...top4Credits.map((row) => ({ name: row.name, creditsUsed: Number(row.creditsUsed || 0) })),
            ...(otherCredits > 0 ? [{ name: "Other", creditsUsed: otherCredits }] : []),
        ];
        const interviewTotal = Number(interviewTotalRows[0]?.totalInterviews || 0);
        const top4Interviews = interviewTopRows.slice(0, 4);
        const otherInterviews = Math.max(
            0,
            interviewTotal - top4Interviews.reduce((sum, row) => sum + Number(row.count || 0), 0)
        );
        const interviewStatsWithOther = [
            ...top4Interviews.map((row) => ({ name: row.name, count: Number(row.count || 0) })),
            ...(otherInterviews > 0 ? [{ name: "Other", count: otherInterviews }] : []),
        ];
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
            totalInterviewQuotaAllocated: Number(c.totalInterviewQuotaAllocated || 0),
            totalInterviewQuotaConsumed: Number(c.totalInterviewQuotaConsumed || 0),
            totalCreditsUsed: Number(c.totalCreditsUsed || 0),
            orgCreditStats: creditStatsWithOther,
            orgInterviewStats: interviewStatsWithOther,
            orgQuotaStats: orgQuotaStats.map((row) => ({
                name: row.name,
                used: Number(row.used),
                total: Number(row.total),
            })),
            platformHealth,
            engagedOrgs,
            recentActivity,
            trends: {
                orgs: calc(Number(t.orgsNew), Number(t.orgsPrev)),
                admins: calc(Number(t.adminsNew), Number(t.adminsPrev)),
                drives: calc(Number(t.drivesNew), Number(t.drivesPrev)),
                candidates: calc(Number(t.candidatesNew), Number(t.candidatesPrev)),
            },
        }, {
            headers: { "Cache-Control": "private, max-age=60" },
        });
    } catch (error: unknown) {
        console.error("super-admin stats error:", error);
        return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
    }
}
