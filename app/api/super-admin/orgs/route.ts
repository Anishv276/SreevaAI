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
        let whereClause: any = search ? {
            OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { slug: { contains: search, mode: "insensitive" as const } },
            ]
        } : {};

        if (fromDate && toDate) {
            whereClause.createdAt = {
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
                totalHired: number;
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
                    (SELECT COUNT(*)::INT FROM "Application" WHERE "hiringStatus" = 'hired') as "totalHired",
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
                (SELECT 'ORG' as type, name as detail, '' as org, "createdAt" as at FROM "Organization")
                UNION ALL
                (SELECT 'DRIVE' as type, title as detail, (SELECT name FROM "Organization" o WHERE o.id = d."orgId") as org, "createdAt" as at FROM "Drive" d)
                UNION ALL
                (SELECT 'CANDIDATE' as type, "fullName" as detail, (SELECT name FROM "Organization" o JOIN "Drive" d2 ON d2."orgId" = o.id WHERE d2.id = a."driveId") as org, "createdAt" as at FROM "Application" a)
                UNION ALL
                (SELECT 'INTERVIEW' as type, 'Completed' as detail, (SELECT name FROM "Organization" o JOIN "Drive" d3 ON d3."orgId" = o.id JOIN "Application" a2 ON a2."driveId" = d3.id WHERE a2.id = i."applicationId") as org, "completedAt" as at FROM "Interview" i WHERE i."status" = 'COMPLETED')
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
            totalHired: c.totalHired || 0,
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

        return NextResponse.json({
            orgs,
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
            orgName, slug, plan, logoUrl, adminEmail, adminName, adminPassword,
            maxActiveDrives,
            interviewQuotaTotal,
            proctoringSignals,
            ttsProvider, cartesiaVoiceId, cartesiaModel, sarvamModel, sarvamVoice, googleModel, googleVoiceName,
            sttProvider, deepgramModel, sarvamSttModel,
            llmProvider, llmModel, llmTemperature,
            location
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

        // Admin Password Validation
        const { isValid: isPasswordValid, error: passwordError } = validatePasswordStrength(adminPassword);
        if (!isPasswordValid) {
            return NextResponse.json({ error: passwordError }, { status: 400 });
        }

        // Check slug uniqueness
        const existing = await prisma.organization.findUnique({ where: { slug } });
        if (existing) {
            return NextResponse.json({ error: "Slug already taken. Choose another." }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        const normalizedPlan = normalizeOrgPlan(plan) || DEFAULT_ORG_PLAN;
        const resolvedSignals =
            proctoringSignals !== undefined
                ? normalizeProctoringSignals(proctoringSignals)
                : undefined;

        console.log("[SuperAdmin] Provisioning Org with AI Config:", { ttsProvider, sttProvider });

        // Create org + admin in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // Build org data explicitly to ensure exclusivity
            const orgData: any = {
                name: orgName,
                slug: slug.toLowerCase().replace(/\s+/g, "-"),
                plan: normalizedPlan,
                maxActiveDrives:
                    maxActiveDrives !== undefined && maxActiveDrives !== null && String(maxActiveDrives).trim() !== ""
                        ? normalizeOrgLimitInput(maxActiveDrives)
                        : "Unlimited",
                interviewQuotaTotal: Math.max(0, Math.round(Number(interviewQuotaTotal ?? 0) || 0)),
                creditsUsed: 0,
                logoUrl: logoUrl || null,
                usageMetrics: {},
                location: location || null,
            };

            if (resolvedSignals !== undefined) {
                orgData.proctoringSignals = resolvedSignals;
            }

            Object.assign(
                orgData,
                normalizeOrgAiConfig({
                    next: {
                        ttsProvider,
                        cartesiaVoiceId,
                        cartesiaModel,
                        sarvamModel,
                        sarvamVoice,
                        googleModel,
                        googleVoiceName,
                        sttProvider,
                        deepgramModel,
                        sarvamSttModel,
                        llmProvider,
                        llmModel,
                        llmTemperature,
                    },
                })
            );

            const orgId = generateId("org", orgName);
            const userName = adminName || adminEmail.split("@")[0];
            const userId = generateId("usr", userName);

            const org = await tx.organization.create({
                data: { id: orgId, ...orgData },
            });

            const admin = await tx.user.create({
                data: {
                    id: userId,
                    email: adminEmail.toLowerCase().trim(),
                    name: userName,
                    role: "ORG_ADMIN",
                    orgRole: "ADMIN",
                    password: hashedPassword,
                    orgId: org.id,
                },
            });

            return { org, admin };
        });

        // -- Phase 4: Send Welcome Email (Non-blocking) --------------
        sendWelcomeViaResend({
            email: result.admin.email,
            orgName: result.org.name,
            adminName: result.admin.name || adminName
        }).catch(err => console.error("[WELCOME EMAIL ERROR]", err));

        return NextResponse.json({
            success: true,
            org: result.org,
            adminEmail: result.admin.email,
        });
    } catch (error: any) {
        console.error("Error creating org:", error);
        if (error.code === "P2002") {
            return NextResponse.json({ error: "Email or slug already exists" }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
    }
}
