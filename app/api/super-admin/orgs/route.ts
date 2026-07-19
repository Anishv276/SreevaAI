import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { generateId } from "@/lib/ids";
import { validatePasswordStrength } from "@/lib/validation";
import { sendOrgWelcomeEmail as sendWelcomeViaResend } from "@/lib/mail";
import { DEFAULT_ORG_PLAN, isOrgPlan, normalizeOrgPlan } from "@/lib/org-plans";
import { normalizeProctoringSignals } from "@/lib/proctoring-signals";
import { normalizeOrgLimitInput } from "@/lib/org-limits";
import { normalizeOrgStatusControl, ORG_STATUS_CONTROL_MANUAL } from "@/lib/credits";
import { normalizeEmail } from "@/lib/email";
import { normalizeRecordingRetentionDays } from "@/lib/recording-retention";
import { apiErrorResponse, alertError } from "@/lib/slack-error-logger";
// GET /api/super-admin/orgs - list organizations with stats, pagination, and search
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }
        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
        const search = searchParams.get("q")?.trim() || "";
        const offset = (page - 1) * limit;
        const from = searchParams.get("from");
        const to = searchParams.get("to");
        const fromDate = from ? new Date(from) : null;
        const toDate = to ? new Date(to) : null;
        // -- Phase 1: Total Count (Filtered) -------------------
        const whereClause: Prisma.OrganizationDetailsWhereInput = search ? {
            OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { urlSlug: { contains: search, mode: "insensitive" as const } },
            ]
        } : {};
        if (fromDate && toDate) {
            (whereClause as Prisma.OrganizationDetailsWhereInput).orgCreatedAt = {
                gte: fromDate,
                lte: toDate
            };
        }
        const total = await prisma.organizationDetails.count({ where: whereClause });
        const totalPages = Math.ceil(total / limit);
        // -- Phase 2: Paginated Org Data (Unified SQL) --------------
        // Escape ILIKE wildcards in user input so a search term containing
        // % or _ is matched literally instead of acting as a pattern.
        const escapedSearch = search.replace(/[\\%_]/g, (c) => `\\${c}`);
        const sqlSearch = search ? `%${escapedSearch}%` : "%";
        // We use queryRaw for complex subcounts
        const orgs = (await prisma.$queryRaw`
            SELECT
                o.*,
                (SELECT COUNT(*)::INT FROM "OrganizationCredentials" u WHERE u."organizationId" = o.id AND u."isDeleted" = false) as "adminCount",
                (SELECT COUNT(*)::INT FROM "Job" d WHERE d."organizationId" = o.id AND d."isDeleted" = false) as "jobCount",
                (SELECT COUNT(*)::INT FROM "Application" a JOIN "Job" d ON d.id = a."jobId" WHERE d."organizationId" = o.id AND a."isDeleted" = false AND d."isDeleted" = false) as "candidateCount",
                (SELECT COUNT(*)::INT FROM "Interview" i
                 JOIN "Application" a ON a.id = i."applicationId"
                 JOIN "Job" d ON d.id = a."jobId"
                 WHERE d."organizationId" = o.id AND i."isDeleted" = false AND a."isDeleted" = false AND d."isDeleted" = false) as "interviewCount",
                (SELECT COUNT(*)::INT FROM "Interview" i
                 JOIN "Application" a ON a.id = i."applicationId"
                 JOIN "Job" d ON d.id = a."jobId"
                 WHERE d."organizationId" = o.id AND i."isDeleted" = false AND a."isDeleted" = false AND d."isDeleted" = false AND i."interviewStatus" = 'COMPLETED') as "interviewsCompleted",
                COALESCE(o."billingCreditsUsed", 0) as "billingCreditsUsed"
            FROM "OrganizationDetails" o
            WHERE o."isDeleted" = false AND (o."name" ILIKE ${sqlSearch} OR o."urlSlug" ILIKE ${sqlSearch})
            ${fromDate && toDate ? Prisma.sql`AND o."orgCreatedAt" BETWEEN ${fromDate} AND ${toDate}` : Prisma.empty}
            ORDER BY o."orgCreatedAt" DESC
            LIMIT ${limit} OFFSET ${offset}
        `) as Array<Record<string, unknown> & {
            adminCount: number;
            jobCount: number;
            candidateCount: number;
            interviewCount: number;
            interviewsCompleted: number;
            billingCreditsUsed: number;
            totalInterviewsAllowed: number;
            totalInterviewsUsed: number;
        }>;
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
            prisma.organizationDetails.count(),
            prisma.organizationDetails.count({ where: { orgStatus: "ACTIVE" } }),
            prisma.organizationDetails.count({ where: { orgStatus: "SUSPENDED" } }),
            prisma.organizationDetails.count({ where: { orgStatus: "CLOSED" } }),
            prisma.$queryRaw<Array<{
                totalAdmins: number;
                totalJobs: number;
                totalCandidates: number;
                totalShortlisted: number;
                totalInterviewed: number;
                totalInterviewQuotaAllocated: number;
                totalInterviewQuotaConsumed: number;
                totalCreditsUsed: number;
            }>>`
                SELECT
                    (SELECT COUNT(*)::INT FROM "OrganizationCredentials" WHERE "isDeleted" = false) as "totalAdmins",
                    (SELECT COUNT(*)::INT FROM "Job" WHERE "isDeleted" = false) as "totalJobs",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "isDeleted" = false) as "totalCandidates",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "isDeleted" = false AND "resumeScreeningStatus" = 'shortlisted') as "totalShortlisted",
                    (SELECT COUNT(*)::INT FROM "Interview" WHERE "isDeleted" = false AND "interviewStatus" = 'COMPLETED') as "totalInterviewed",
                    COALESCE(SUM("totalInterviewsAllowed"), 0)::INT as "totalInterviewQuotaAllocated",
                    COALESCE(SUM("totalInterviewsUsed"), 0)::INT as "totalInterviewQuotaConsumed",
                    COALESCE(SUM(COALESCE("billingCreditsUsed", 0)), 0)::FLOAT as "totalCreditsUsed"
                FROM "OrganizationDetails" WHERE "isDeleted" = false
            `,
            prisma.$queryRaw<Array<{ name: string, billingCreditsUsed: number }>>`
                SELECT
                    o."name",
                    COALESCE(o."billingCreditsUsed", 0) as "billingCreditsUsed"
                FROM "OrganizationDetails" o
                WHERE o."isDeleted" = false
                ORDER BY "billingCreditsUsed" DESC
                LIMIT 5
            `,
            prisma.$queryRaw<Array<{ name: string, count: number }>>`
                SELECT o."name", COUNT(i.id)::INT as "count"
                FROM "OrganizationDetails" o
                JOIN "Job" d ON d."organizationId" = o.id
                JOIN "Application" a ON a."jobId" = d.id
                JOIN "Interview" i ON i."applicationId" = a.id
                WHERE o."isDeleted" = false AND d."isDeleted" = false AND a."isDeleted" = false AND i."isDeleted" = false
                GROUP BY o."name"
                ORDER BY "count" DESC
                LIMIT 5
            `,
            prisma.$queryRaw<Array<{ type: string, detail: string, org: string, at: Date }>>`
                SELECT * FROM (
                    SELECT * FROM (
                        SELECT 'ORG' as type, name as detail, '' as org, "orgCreatedAt" as at
                        FROM "OrganizationDetails"
                        WHERE "isDeleted" = false
                        ORDER BY "orgCreatedAt" DESC
                        LIMIT 10
                    ) org_activity
                    UNION ALL
                    SELECT * FROM (
                        SELECT 'JOB' as type, d.title as detail, COALESCE(o.name, '') as org, d."jobCreatedAt" as at
                        FROM "Job" d
                        LEFT JOIN "OrganizationDetails" o ON o.id = d."organizationId"
                        WHERE d."isDeleted" = false
                        ORDER BY d."jobCreatedAt" DESC
                        LIMIT 10
                    ) job_activity
                    UNION ALL
                    SELECT * FROM (
                        SELECT 'CANDIDATE' as type, a."candidateFullName" as detail, COALESCE(o.name, '') as org, a."appliedAt" as at
                        FROM "Application" a
                        LEFT JOIN "Job" d ON d.id = a."jobId"
                        LEFT JOIN "OrganizationDetails" o ON o.id = d."organizationId"
                        WHERE a."isDeleted" = false
                        ORDER BY a."appliedAt" DESC
                        LIMIT 10
                    ) candidate_activity
                    UNION ALL
                    SELECT * FROM (
                        SELECT 'INTERVIEW' as type, 'Completed' as detail, COALESCE(o.name, '') as org, i."interviewCompletedAt" as at
                        FROM "Interview" i
                        JOIN "Application" a ON a.id = i."applicationId"
                        LEFT JOIN "Job" d ON d.id = a."jobId"
                        LEFT JOIN "OrganizationDetails" o ON o.id = d."organizationId"
                        WHERE i."isDeleted" = false AND a."isDeleted" = false AND i."interviewStatus" = 'COMPLETED' AND i."interviewCompletedAt" IS NOT NULL
                        ORDER BY i."interviewCompletedAt" DESC
                        LIMIT 10
                    ) interview_activity
                ) activity_feed
                ORDER BY at DESC
                LIMIT 10
            `,
            prisma.$queryRaw<Array<{
                orgsNew: number;
                orgsPrev: number;
                adminsNew: number;
                adminsPrev: number;
                jobsNew: number;
                jobsPrev: number;
                candidatesNew: number;
                candidatesPrev: number;
            }>>`
                SELECT
                    (SELECT COUNT(*)::INT FROM "OrganizationDetails" WHERE "isDeleted" = false AND "orgCreatedAt" >= ${lastWeek}) as "orgsNew",
                    (SELECT COUNT(*)::INT FROM "OrganizationDetails" WHERE "isDeleted" = false AND "orgCreatedAt" >= ${twoWeeksAgo} AND "orgCreatedAt" < ${lastWeek}) as "orgsPrev",
                    (SELECT COUNT(*)::INT FROM "OrganizationCredentials" WHERE "isDeleted" = false AND "accountCreatedAt" >= ${lastWeek}) as "adminsNew",
                    (SELECT COUNT(*)::INT FROM "OrganizationCredentials" WHERE "isDeleted" = false AND "accountCreatedAt" >= ${twoWeeksAgo} AND "accountCreatedAt" < ${lastWeek}) as "adminsPrev",
                    (SELECT COUNT(*)::INT FROM "Job" WHERE "isDeleted" = false AND "jobCreatedAt" >= ${lastWeek}) as "jobsNew",
                    (SELECT COUNT(*)::INT FROM "Job" WHERE "isDeleted" = false AND "jobCreatedAt" >= ${twoWeeksAgo} AND "jobCreatedAt" < ${lastWeek}) as "jobsPrev",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "isDeleted" = false AND "appliedAt" >= ${lastWeek}) as "candidatesNew",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "isDeleted" = false AND "appliedAt" >= ${twoWeeksAgo} AND "appliedAt" < ${lastWeek}) as "candidatesPrev"
            `,
        ]);
        const calculateTrend = (curr: number, prev: number) => {
            if (prev === 0) return curr > 0 ? 100 : 0;
            return Math.round(((curr - prev) / prev) * 100);
        };
        const t = trends[0] || {};
        const c = counts[0] || {};
        const stats = {
            totalOrgs,
            activeOrgs,
            suspendedOrgs,
            closedOrgs,
            totalAdmins: c.totalAdmins || 0,
            totalJobs: c.totalJobs || 0,
            totalCandidates: c.totalCandidates || 0,
            totalShortlisted: c.totalShortlisted || 0,
            totalInterviewed: c.totalInterviewed || 0,
            totalInterviewQuotaAllocated: c.totalInterviewQuotaAllocated || 0,
            totalInterviewQuotaConsumed: c.totalInterviewQuotaConsumed || 0,
            totalCreditsUsed: c.totalCreditsUsed || 0,
            orgCreditStats: orgCreditStats.map(o => ({
                name: o.name,
                creditsUsed: Number(o.billingCreditsUsed || 0),
            })),
            orgInterviewStats: orgInterviewStats.map(o => ({
                name: o.name,
                count: Number(o.count || 0)
            })),
            recentActivity,
            trends: {
                orgs: calculateTrend(t.orgsNew, t.orgsPrev),
                admins: calculateTrend(t.adminsNew, t.adminsPrev),
                jobs: calculateTrend(t.jobsNew, t.jobsPrev),
                candidates: calculateTrend(t.candidatesNew, t.candidatesPrev),
                credits: 0
            }
        };
        const toEffectiveStatus = (org: {
            status?: string | null;
            statusControl?: string | null;
            totalInterviewsAllowed?: number | null;
            totalInterviewsUsed?: number | null;
        }) => {
            const status = String(org.status || "ACTIVE").toUpperCase();
            if (status === "CLOSED") {
                return "CLOSED";
            }
            const statusControl = normalizeOrgStatusControl(org.statusControl);
            if (statusControl === ORG_STATUS_CONTROL_MANUAL) {
                return "SUSPENDED";
            }
            const total = Math.max(0, Number(org.totalInterviewsAllowed || 0));
            const used = Math.max(0, Number(org.totalInterviewsUsed || 0));
            const remaining = Math.max(0, total - used);
            if (total > 0 && remaining <= 0) return "SUSPENDED";
            if (total > 0 && remaining > 0) return "ACTIVE";
            return status;
        };
        return NextResponse.json({
            orgs: orgs.map((org) => ({
                ...org,
                status: toEffectiveStatus({
                    status: org.orgStatus as string | null,
                    statusControl: org.quotaControlMode as string | null,
                    totalInterviewsAllowed: org.totalInterviewsAllowed as number | null,
                    totalInterviewsUsed: org.totalInterviewsUsed as number | null,
                }),
            })),
            pagination: { total, page, limit, totalPages },
            stats,
        });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/super-admin/orgs",
            method: "GET",
            error,
            body: { error: "Failed to fetch organizations" },
            status: 500,
            logLabel: "Error fetching orgs:",
        });
    }
}
// POST /api/super-admin/orgs - create new org + HR admin user
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }
        const body = await request.json();
        const {
            orgName, slug, plan, adminEmail, adminPassword,
            maxActiveJobs,
            totalInterviewsAllowed: requestedTotalInterviewsAllowed,
            recordingEnabled,
            recordingRetentionDays,
            proctoringSignals,
            maxConcurrentSlots
        } = body;
        if (!orgName || !slug || !adminEmail || !adminPassword) {
            return NextResponse.json({ error: "orgName, slug, adminEmail, and adminPassword are required" }, { status: 400 });
        }
        // Plan Validation
        if (plan && !isOrgPlan(plan)) {
            return NextResponse.json({ error: "Invalid organization plan" }, { status: 400 });
        }
        // Email Validation
        const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!EMAIL_REGEX.test(adminEmail)) {
            return NextResponse.json({ error: "Invalid admin email format" }, { status: 400 });
        }
        const normalizedAdminEmail = normalizeEmail(adminEmail);
        const [existingSuperAdmin, existingUser] = await Promise.all([
            prisma.superAdmin.findFirst({
                where: {
                    email: {
                        equals: normalizedAdminEmail,
                        mode: "insensitive",
                    },
                },
                select: { id: true },
            }),
            prisma.organizationCredentials.findFirst({
                where: {
                    email: {
                        equals: normalizedAdminEmail,
                        mode: "insensitive",
                    },
                },
                select: { id: true },
            }),
        ]);
        if (existingSuperAdmin || existingUser) {
            return NextResponse.json({ error: "Email already exists. Choose another one." }, { status: 409 });
        }
        // Admin Password Validation
        const { isValid: isPasswordValid, error: passwordError } = validatePasswordStrength(adminPassword);
        if (!isPasswordValid) {
            return NextResponse.json({ error: passwordError }, { status: 400 });
        }
        const normalizedSlug = String(slug || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-");
        if (!normalizedSlug) {
            return NextResponse.json({ error: "slug is required" }, { status: 400 });
        }
        // Check slug uniqueness against the exact value that will be stored.
        const existing = await prisma.organizationDetails.findUnique({ where: { urlSlug: normalizedSlug } });
        if (existing) {
            return NextResponse.json({ error: `Slug "${normalizedSlug}" is already taken. Choose another.` }, { status: 409 });
        }
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        const normalizedPlan = normalizeOrgPlan(plan) || DEFAULT_ORG_PLAN;
        const resolvedSignals =
            proctoringSignals !== undefined
                ? normalizeProctoringSignals(proctoringSignals)
                : undefined;
        const resolvedRecordingEnabled = recordingEnabled === true || recordingEnabled === "true";
        const resolvedRecordingRetentionDays = normalizeRecordingRetentionDays(recordingRetentionDays);
        if (resolvedRecordingEnabled && resolvedRecordingRetentionDays === null) {
            return NextResponse.json(
                { error: "Recording retention days are required when recording is enabled" },
                { status: 400 }
            );
        }
        console.log("[SuperAdmin] Provisioning Org — AI models configured via AI Models page");
        // Create org + admin in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // Build org data explicitly to ensure exclusivity
            const orgData: Prisma.OrganizationDetailsCreateInput & {
                id: string;
            } = {
                id: generateId("org", orgName),
                name: orgName,
                urlSlug: normalizedSlug,
                billingPlan: normalizedPlan,
                maxActiveJobs:
                    maxActiveJobs !== undefined && maxActiveJobs !== null && String(maxActiveJobs).trim() !== ""
                        ? normalizeOrgLimitInput(maxActiveJobs)
                        : "Unlimited",
                maxConcurrentInterviews: maxConcurrentSlots !== undefined && maxConcurrentSlots !== null ? Math.max(1, parseInt(maxConcurrentSlots)) : 5,
                totalInterviewsAllowed: Math.max(0, Math.round(Number(requestedTotalInterviewsAllowed ?? 0) || 0)),
                billingCreditsUsed: 0,
                isRecordingEnabled: resolvedRecordingEnabled ? true : null,
                recordingKeepForDays: resolvedRecordingEnabled ? resolvedRecordingRetentionDays : null,
            };
            if (resolvedSignals !== undefined) {
                orgData.enabledProctoringSignals = resolvedSignals;
            }
            // AI models set to schema defaults -- configured later via Super Admin → AI Models page
            const userId = generateId("usr", normalizedAdminEmail.split("@")[0]);
            const org = await tx.organizationDetails.create({
                data: orgData,
            });
            const admin = await tx.organizationCredentials.create({
                data: {
                    id: userId,
                    email: normalizedAdminEmail,
                    name: orgName,
                    password: hashedPassword,
                    organizationId: org.id,
                },
            });
            return { org, admin };
        });
        // -- Phase 4: Send Welcome Email (Non-blocking) --------------
        sendWelcomeViaResend({
            email: result.admin.email,
            orgName: result.org.name
        }).catch(err => console.error("[WELCOME EMAIL ERROR]", err));
        return NextResponse.json({
            success: true,
            org: result.org,
            adminEmail: result.admin.email,
        });
    } catch (error: unknown) {
        console.error("Error creating org:", error);
        const isConflict = typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "P2002";
        if (!isConflict) {
            await alertError({ type: 'api', error: error instanceof Error ? error : String(error), reason: "API error on POST /api/super-admin/orgs" });
        }
        if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "P2002") {
            const meta = error as { meta?: { target?: unknown } };
            const target = Array.isArray(meta.meta?.target) ? meta.meta?.target.map(String) : [];
            if (target.includes("slug")) {
                return NextResponse.json({ error: "Slug already exists. Choose another." }, { status: 409 });
            }
            if (target.includes("email")) {
                return NextResponse.json({ error: "Email already exists. Choose another one." }, { status: 409 });
            }
            if (target.includes("id")) {
                return NextResponse.json({ error: "A generated organization ID collided. Retry the request." }, { status: 409 });
            }
            return NextResponse.json({ error: "A unique field already exists. Check slug and email." }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
    }
}
