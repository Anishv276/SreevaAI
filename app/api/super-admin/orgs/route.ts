import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET /api/super-admin/orgs — list all organizations with stats
export async function GET() {
    try {
        const orgs = await prisma.organization.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                _count: { select: { users: true, drives: true } },
            },
        });

        const result = await Promise.all(
            orgs.map(async (org) => {
                const driveIds = await prisma.drive.findMany({
                    where: { orgId: org.id },
                    select: { id: true },
                });
                const candidateCount = await prisma.application.count({
                    where: { driveId: { in: driveIds.map(d => d.id) } },
                });
                return {
                    ...org,
                    adminCount: org._count.users,
                    driveCount: org._count.drives,
                    candidateCount,
                };
            })
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error("Error fetching orgs:", error);
        return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
    }
}

// POST /api/super-admin/orgs — create new org + HR admin user
export async function POST(request: Request) {
    try {
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
