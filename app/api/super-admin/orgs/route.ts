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
import { normalizeOrgAiConfig } from "@/lib/ai-provider-config";
import { normalizeOrgLimitInput } from "@/lib/org-limits";
import { normalizeOrgStatusControl, ORG_STATUS_CONTROL_MANUAL } from "@/lib/credits";
import { normalizeEmail } from "@/lib/email";
import { normalizeRecordingRetentionDays } from "@/lib/recording-retention";
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
        const whereClause: Prisma.OrganizationWhereInput = search ? {
            OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { slug: { contains: search, mode: "insensitive" as const } },
            ]
        } : {};
        if (fromDate && toDate) {
            (whereClause as Prisma.OrganizationWhereInput).createdAt = {
                gte: fromDate,
                lte: toDate
            };
        }
        const total = await prisma.organization.count({ where: whereClause });
        const totalPages = Math.ceil(total / limit);
        // -- Phase 2: Paginated Org Data (Unified SQL) --------------
        const sqlSearch = search ? `%${search}%` : "%";
        // We use queryRaw for complex subcounts
        const orgs = (await prisma.$queryRaw`
            SELECT 
                o.*,
                (SELECT COUNT(*)::INT FROM "User" u WHERE u."orgId" = o.id) as "adminCount",
                (SELECT COUNT(*)::INT FROM "Drive" d WHERE d."orgId" = o.id) as "driveCount",
                (SELECT COUNT(*)::INT FROM "Application" a JOIN "Drive" d ON d.id = a."driveId" WHERE d."orgId" = o.id) as "candidateCount",
                (SELECT COUNT(*)::INT FROM "Interview" i 
                 JOIN "Application" a ON a.id = i."applicationId" 
                 JOIN "Drive" d ON d.id = a."driveId" 
                 WHERE d."orgId" = o.id) as "interviewCount",
                (SELECT COUNT(*)::INT FROM "Interview" i 
                 JOIN "Application" a ON a.id = i."applicationId" 
                 JOIN "Drive" d ON d.id = a."driveId" 
                 WHERE d."orgId" = o.id AND i."status" = 'COMPLETED') as "interviewsCompleted",
                COALESCE(o."creditsUsed", 0) as "creditsUsed"
            FROM "Organization" o
            WHERE (o."name" ILIKE ${sqlSearch} OR o."slug" ILIKE ${sqlSearch})
            ${fromDate && toDate ? Prisma.sql`AND o."createdAt" BETWEEN ${fromDate} AND ${toDate}` : Prisma.empty}
            ORDER BY o."createdAt" DESC
            LIMIT ${limit} OFFSET ${offset}
        `) as Array<Record<string, unknown> & {
            adminCount: number;
            driveCount: number;
            candidateCount: number;
            interviewCount: number;
            interviewsCompleted: number;
            creditsUsed: number;
            interviewQuotaTotal: number;
            interviewQuotaUsed: number;
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
                totalInterviewQuotaAllocated: number;
                totalInterviewQuotaConsumed: number;
                totalCreditsUsed: number;
            }>>`
                SELECT 
                    (SELECT COUNT(*)::INT FROM "User") as "totalAdmins",
                    (SELECT COUNT(*)::INT FROM "Drive") as "totalDrives",
                    (SELECT COUNT(*)::INT FROM "Application") as "totalCandidates",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "resumeStatus" = 'shortlisted') as "totalShortlisted",
                    (SELECT COUNT(*)::INT FROM "Interview" WHERE "status" = 'COMPLETED') as "totalInterviewed",
                    COALESCE(SUM("interviewQuotaTotal"), 0)::INT as "totalInterviewQuotaAllocated",
                    COALESCE(SUM("interviewQuotaUsed"), 0)::INT as "totalInterviewQuotaConsumed",
                    COALESCE(SUM(COALESCE("creditsUsed", 0)), 0)::FLOAT as "totalCreditsUsed"
                FROM "Organization"
            `,
            prisma.$queryRaw<Array<{ name: string, creditsUsed: number }>>`
                SELECT
                    o."name",
                    COALESCE(o."creditsUsed", 0) as "creditsUsed"
                FROM "Organization" o
                ORDER BY "creditsUsed" DESC
                LIMIT 5
            `,
            prisma.$queryRaw<Array<{ name: string, count: number }>>`
                SELECT o."name", COUNT(i.id)::INT as "count"
                FROM "Organization" o
                JOIN "Drive" d ON d."orgId" = o.id
                JOIN "Application" a ON a."driveId" = d.id
                JOIN "Interview" i ON i."applicationId" = a.id
                GROUP BY o."name"
                ORDER BY "count" DESC
                LIMIT 5
            `,
            prisma.$queryRaw<Array<{ type: string, detail: string, org: string, at: Date }>>`
                SELECT * FROM (
                    SELECT * FROM (
                        SELECT 'ORG' as type, name as detail, '' as org, "createdAt" as at
                        FROM "Organization"
                        ORDER BY "createdAt" DESC
                        LIMIT 10
                    ) org_activity
                    UNION ALL
                    SELECT * FROM (
                        SELECT 'DRIVE' as type, d.title as detail, COALESCE(o.name, '') as org, d."createdAt" as at
                        FROM "Drive" d
                        LEFT JOIN "Organization" o ON o.id = d."orgId"
                        ORDER BY d."createdAt" DESC
                        LIMIT 10
                    ) drive_activity
                    UNION ALL
                    SELECT * FROM (
                        SELECT 'CANDIDATE' as type, a."fullName" as detail, COALESCE(o.name, '') as org, a."createdAt" as at
                        FROM "Application" a
                        LEFT JOIN "Drive" d ON d.id = a."driveId"
                        LEFT JOIN "Organization" o ON o.id = d."orgId"
                        ORDER BY a."createdAt" DESC
                        LIMIT 10
                    ) candidate_activity
                    UNION ALL
                    SELECT * FROM (
                        SELECT 'INTERVIEW' as type, 'Completed' as detail, COALESCE(o.name, '') as org, i."completedAt" as at
                        FROM "Interview" i
                        JOIN "Application" a ON a.id = i."applicationId"
                        LEFT JOIN "Drive" d ON d.id = a."driveId"
                        LEFT JOIN "Organization" o ON o.id = d."orgId"
                        WHERE i."status" = 'COMPLETED' AND i."completedAt" IS NOT NULL
                        ORDER BY i."completedAt" DESC
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
                drivesNew: number;
                drivesPrev: number;
                candidatesNew: number;
                candidatesPrev: number;
            }>>`
                SELECT 
                    (SELECT COUNT(*)::INT FROM "Organization" WHERE "createdAt" >= ${lastWeek}) as "orgsNew",
                    (SELECT COUNT(*)::INT FROM "Organization" WHERE "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) as "orgsPrev",
                    (SELECT COUNT(*)::INT FROM "User" WHERE "createdAt" >= ${lastWeek}) as "adminsNew",
                    (SELECT COUNT(*)::INT FROM "User" WHERE "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) as "adminsPrev",
                    (SELECT COUNT(*)::INT FROM "Drive" WHERE "createdAt" >= ${lastWeek}) as "drivesNew",
                    (SELECT COUNT(*)::INT FROM "Drive" WHERE "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) as "drivesPrev",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "createdAt" >= ${lastWeek}) as "candidatesNew",
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "createdAt" >= ${twoWeeksAgo} AND "createdAt" < ${lastWeek}) as "candidatesPrev"
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
            totalDrives: c.totalDrives || 0,
            totalCandidates: c.totalCandidates || 0,
            totalShortlisted: c.totalShortlisted || 0,
            totalInterviewed: c.totalInterviewed || 0,
            totalInterviewQuotaAllocated: c.totalInterviewQuotaAllocated || 0,
            totalInterviewQuotaConsumed: c.totalInterviewQuotaConsumed || 0,
            totalCreditsUsed: c.totalCreditsUsed || 0,
            orgCreditStats: orgCreditStats.map(o => ({
                name: o.name,
                creditsUsed: Number(o.creditsUsed || 0),
            })),
            orgInterviewStats: orgInterviewStats.map(o => ({
                name: o.name,
                count: Number(o.count || 0)
            })),
            recentActivity,
            trends: {
                orgs: calculateTrend(t.orgsNew, t.orgsPrev),
                admins: calculateTrend(t.adminsNew, t.adminsPrev),
                drives: calculateTrend(t.drivesNew, t.drivesPrev),
                candidates: calculateTrend(t.candidatesNew, t.candidatesPrev),
                credits: 0
            }
        };
        const toEffectiveStatus = (org: {
            status?: string | null;
            statusControl?: string | null;
            interviewQuotaTotal?: number | null;
            interviewQuotaUsed?: number | null;
        }) => {
            const status = String(org.status || "ACTIVE").toUpperCase();
            if (status === "CLOSED") {
                return "CLOSED";
            }
            const statusControl = normalizeOrgStatusControl(org.statusControl);
            if (statusControl === ORG_STATUS_CONTROL_MANUAL) {
                return "SUSPENDED";
            }
            const total = Math.max(0, Number(org.interviewQuotaTotal || 0));
            const used = Math.max(0, Number(org.interviewQuotaUsed || 0));
            const remaining = Math.max(0, total - used);
            if (total > 0 && remaining <= 0) return "SUSPENDED";
            if (total > 0 && remaining > 0) return "ACTIVE";
            return status;
        };
        return NextResponse.json({
            orgs: orgs.map((org) => ({
                ...org,
                status: toEffectiveStatus(org),
            })),
            pagination: { total, page, limit, totalPages },
            stats,
        });
    } catch (error) {
        console.error("Error fetching orgs:", error);
        return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
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
            maxActiveDrives,
            interviewQuotaTotal,
            recordingEnabled,
            recordingRetentionDays,
            proctoringSignals,
            voiceId, allowedVoices,
            deepgramModel
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
            prisma.user.findFirst({
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
        const existing = await prisma.organization.findUnique({ where: { slug: normalizedSlug } });
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
        console.log("[SuperAdmin] Provisioning Org with AI Config:", { voiceId, deepgramModel });
        // Create org + admin in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // Build org data explicitly to ensure exclusivity
            const orgData: Prisma.OrganizationCreateInput & {
                id: string;
                usageMetrics: Prisma.InputJsonValue;
            } = {
                id: generateId("org", orgName),
                name: orgName,
                slug: normalizedSlug,
                plan: normalizedPlan,
                maxActiveDrives:
                    maxActiveDrives !== undefined && maxActiveDrives !== null && String(maxActiveDrives).trim() !== ""
                        ? normalizeOrgLimitInput(maxActiveDrives)
                        : "Unlimited",
                interviewQuotaTotal: Math.max(0, Math.round(Number(interviewQuotaTotal ?? 0) || 0)),
                creditsUsed: 0,
                recordingEnabled: resolvedRecordingEnabled ? true : null,
                recordingRetentionDays: resolvedRecordingEnabled ? resolvedRecordingRetentionDays : null,
                usageMetrics: {},
            };
            if (resolvedSignals !== undefined) {
                orgData.proctoringSignals = resolvedSignals;
            }
            Object.assign(
                orgData,
                normalizeOrgAiConfig({
                    next: { voiceId, allowedVoices, deepgramModel },
                })
            );
            const userId = generateId("usr", normalizedAdminEmail.split("@")[0]);
            const org = await tx.organization.create({
                data: orgData,
            });
            const admin = await tx.user.create({
                data: {
                    id: userId,
                    email: normalizedAdminEmail,
                    name: userName,
                    password: hashedPassword,
                    orgId: org.id,
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
