import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

// GET /api/super-admin/orgs — list organizations with stats, pagination, and search
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

        // ── Phase 1: Total Count (Search Filtered) ───────────────────
        const whereClause = search ? {
            OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { slug: { contains: search, mode: "insensitive" as const } },
            ]
        } : {};

        const total = await prisma.organization.count({ where: whereClause });
        const totalPages = Math.ceil(total / limit);

        // ── Phase 2: Paginated Org Data (Standard Prisma) ────────────
        const orgs = await prisma.organization.findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
            skip: offset,
            take: limit,
            include: {
                _count: {
                    select: { users: true, drives: true }
                }
            }
        });

        // ── Phase 3: Aggregated Candidate Counts (SQL Optimized) ──────
        // We only fetch candidate counts for the organizations on this page
        const orgIds = orgs.map(o => o.id);
        let candidateCounts: { orgId: string; count: bigint }[] = [];

        if (orgIds.length > 0) {
            candidateCounts = await prisma.$queryRaw`
                SELECT d."orgId", COUNT(a.id)::BIGINT as "count"
                FROM "Application" a
                JOIN "Drive" d ON d.id = a."driveId"
                WHERE d."orgId" IN (${orgIds.join(",")})
                GROUP BY d."orgId"
            ` as { orgId: string; count: bigint }[];
        }

        // Map candidate counts back to orgs
        const countMap = new Map(candidateCounts.map(c => [c.orgId, Number(c.count)]));

        const formatted = orgs.map(org => ({
            ...org,
            adminCount: org._count.users,
            driveCount: org._count.drives,
            candidateCount: countMap.get(org.id) || 0,
        }));

        return NextResponse.json({
            orgs: formatted,
            pagination: { total, page, limit, totalPages },
        });
    } catch (error) {
        console.error("Error fetching orgs:", error);
        return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
    }
}

// POST /api/super-admin/orgs — create new org + HR admin user
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }

        const body = await request.json();
        const { orgName, slug, plan, logoUrl, adminEmail, adminName, adminPassword } = body;

        if (!orgName || !slug || !adminEmail || !adminPassword) {
            return NextResponse.json({ error: "orgName, slug, adminEmail, and adminPassword are required" }, { status: 400 });
        }

        // Check slug uniqueness
        const existing = await prisma.organization.findUnique({ where: { slug } });
        if (existing) {
            return NextResponse.json({ error: "Slug already taken. Choose another." }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        // Create org + admin in a transaction
        const result = await prisma.$transaction(async (tx) => {
            const org = await tx.organization.create({
                data: {
                    name: orgName,
                    slug: slug.toLowerCase().replace(/\s+/g, "-"),
                    plan: plan || "STARTER",
                    logoUrl: logoUrl || null,
                },
            });

            const admin = await tx.user.create({
                data: {
                    email: adminEmail.toLowerCase().trim(),
                    name: adminName || adminEmail.split("@")[0],
                    role: "ORG_ADMIN",
                    orgRole: "ADMIN", // Platform-standard role
                    password: hashedPassword,
                    orgId: org.id,
                },
            });

            return { org, admin };
        });

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
