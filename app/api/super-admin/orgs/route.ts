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

        // ── Phase 2: Paginated Org Data (Unified SQL) ──────────────
        // This query merges the organization fetch with count calculations
        // for Admins, Drives, and Candidates into one database round-trip.
        const sqlSearch = search ? `%${search}%` : "%";
        
        const orgs = await prisma.$queryRaw<any[]>`
            SELECT 
                o.*,
                (SELECT COUNT(*)::INT FROM "User" u WHERE u."orgId" = o.id) as "adminCount",
                (SELECT COUNT(*)::INT FROM "Drive" d WHERE d."orgId" = o.id) as "driveCount",
                (SELECT COUNT(*)::INT FROM "Application" a JOIN "Drive" d ON d.id = a."driveId" WHERE d."orgId" = o.id) as "candidateCount"
            FROM "Organization" o
            WHERE (o."name" ILIKE ${sqlSearch} OR o."slug" ILIKE ${sqlSearch})
            ORDER BY o."createdAt" DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        return NextResponse.json({
            orgs,
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
        const { 
            orgName, slug, plan, logoUrl, adminEmail, adminName, adminPassword, 
            ttsProvider, cartesiaVoiceId, cartesiaModel, sarvamModel, sarvamVoice,
            sttProvider, deepgramModel, sarvamSttModel,
            llmProvider, llmModel, llmTemperature
        } = body;

        if (!orgName || !slug || !adminEmail || !adminPassword) {
            return NextResponse.json({ error: "orgName, slug, adminEmail, and adminPassword are required" }, { status: 400 });
        }

        // Check slug uniqueness
        const existing = await prisma.organization.findUnique({ where: { slug } });
        if (existing) {
            return NextResponse.json({ error: "Slug already taken. Choose another." }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        console.log("[SuperAdmin] Provisioning Org with AI Config:", { ttsProvider, sttProvider });

        // Create org + admin in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // Build org data explicitly to ensure exclusivity
            const orgData: any = {
                name: orgName,
                slug: slug.toLowerCase().replace(/\s+/g, "-"),
                plan: plan || "STARTER",
                logoUrl: logoUrl || null,
                ttsProvider: ttsProvider || "CARTESIA",
                sttProvider: sttProvider || "DEEPGRAM",
            };

            // TTS Hierarchy
            if (ttsProvider === "SARVAM") {
                orgData.sarvamModel = sarvamModel || "bulbul:v3";
                orgData.sarvamVoice = sarvamVoice || "shubh";
                orgData.cartesiaVoiceId = null;
                orgData.cartesiaModel = null;
            } else {
                orgData.cartesiaVoiceId = cartesiaVoiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc";
                orgData.cartesiaModel = cartesiaModel || "sonic-english";
                orgData.sarvamModel = null;
                orgData.sarvamVoice = null;
            }

            // STT Hierarchy
            if (sttProvider === "SARVAM") {
                orgData.sarvamSttModel = sarvamSttModel || "saaras:v3";
                orgData.deepgramModel = null;
            } else {
                orgData.deepgramModel = deepgramModel || "nova-3-general";
                orgData.sarvamSttModel = null;
            }

            // LLM Hierarchy
            orgData.llmProvider = llmProvider || "OPENAI";
            orgData.llmModel = llmModel || "gpt-4o";
            orgData.llmTemperature = llmTemperature !== undefined ? Number(llmTemperature) : 0.7;

            const org = await tx.organization.create({
                data: orgData,
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
