import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET /api/super-admin/orgs — list all organizations with stats
export async function GET() {
    try {
        // Fetch orgs with immediate counts for users and drives
        // For candidates, we can't do a direct _count on Application via Org easily in Prisma without deep nesting
        // so we fetch orgs and then do a single optimized count query
        const orgs = await prisma.organization.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                _count: { 
                    select: { 
                        users: true, 
                        drives: true 
                    } 
                },
                drives: {
                    select: {
                        _count: {
                            select: { applications: true }
                        }
                    }
                }
            },
        });

        const formatted = orgs.map(org => {
            // Sum up candidates across all drives for this org
            const candidateCount = org.drives.reduce((sum, drive) => sum + drive._count.applications, 0);
            
            return {
                ...org,
                adminCount: org._count.users,
                driveCount: org._count.drives,
                candidateCount,
                drives: undefined // Hide the relation from the response
            };
        });

        return NextResponse.json(formatted);
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
