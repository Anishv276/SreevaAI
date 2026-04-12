import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole } from "@/lib/auth";
import { buildInviteUrl, generateInviteToken, getInviteExpiry, normalizeOrgRole } from "@/lib/invite";
import { sendTeamInviteEmail } from "@/lib/mail";

async function hasInviteTable() {
    const result = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'OrgInvite'
        ) AS "exists"
        `
    );
    return Boolean(result?.[0]?.exists);
}

async function hasOrgRoleColumn() {
    const result = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'orgRole'
        ) AS "exists"
        `
    );
    return Boolean(result?.[0]?.exists);
}

export async function GET() {
    try {
        const session = await getSession();
        if (!session || !session.orgId || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [inviteTableReady, orgRoleColumnReady] = await Promise.all([hasInviteTable(), hasOrgRoleColumn()]);

        const members = orgRoleColumnReady
            ? await prisma.$queryRawUnsafe<Array<{
                id: string;
                name: string | null;
                email: string;
                role: string;
                orgRole: string | null;
            }>>(
                `
                SELECT id, name, email, role, "orgRole"
                FROM "User"
                WHERE "orgId" = $1 AND role <> 'CANDIDATE'
                ORDER BY "createdAt" DESC
                `,
                session.orgId
            )
            : await prisma.user.findMany({
                where: {
                    orgId: session.orgId,
                    role: { not: "CANDIDATE" },
                },
                orderBy: { createdAt: "desc" },
            });

        if (inviteTableReady) {
            await prisma.$executeRawUnsafe(
                `
                UPDATE "OrgInvite"
                SET status = 'EXPIRED', "updatedAt" = NOW()
                WHERE status = 'PENDING' AND "expiresAt" <= NOW()
                `
            );
        }

        const pendingInvites = inviteTableReady
            ? await prisma.$queryRawUnsafe<Array<{
                id: string;
                email: string;
                orgRole: string;
                expiresAt: string;
                createdAt: string;
            }>>(
                `
                SELECT id, email, "orgRole", "expiresAt", "createdAt"
                FROM "OrgInvite"
                WHERE "orgId" = $1 AND status = 'PENDING'
                ORDER BY "createdAt" DESC
                `,
                session.orgId
            )
            : [];

        const normalizedMembers = (members as Array<{
            id: string;
            name: string | null;
            email: string;
            role: string;
            orgRole?: string | null;
        }>).map((member) => ({
                id: member.id,
                name: member.name,
                email: member.email,
                role: normalizeOrgRole(member.orgRole || member.role),
            }));

        return NextResponse.json({
            members: normalizedMembers,
            pendingInvites,
        });
    } catch (error) {
        console.error("Fetch team error:", error);
        return NextResponse.json({ error: "Failed to fetch team" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || !session.orgId || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const inviteTableReady = await hasInviteTable();
        if (!inviteTableReady) {
            return NextResponse.json({
                error: "Invite table missing. Run invitation SQL migration first.",
            }, { status: 500 });
        }

        const orgRoleColumnReady = await hasOrgRoleColumn();
        if (!orgRoleColumnReady) {
            return NextResponse.json({
                error: "User.orgRole column missing. Run invitation SQL migration first.",
            }, { status: 500 });
        }

        const { email, role } = await request.json();

        const normalizedEmail = String(email || "").trim().toLowerCase();
        const normalizedRole = normalizeOrgRole(role);

        if (!normalizedEmail) {
            return NextResponse.json({ error: "Email required" }, { status: 400 });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existingUser) {
            if (existingUser.orgId === session.orgId && existingUser.role !== "CANDIDATE") {
                return NextResponse.json({ error: "Member already exists in this organization" }, { status: 400 });
            }
            if (existingUser.orgId && existingUser.orgId !== session.orgId) {
                return NextResponse.json({ error: "User already belongs to another organization" }, { status: 409 });
            }
        }

        await prisma.$executeRawUnsafe(
            `
            UPDATE "OrgInvite"
            SET status = 'CANCELLED', "updatedAt" = NOW()
            WHERE "orgId" = $1
              AND LOWER(email) = LOWER($2)
              AND status = 'PENDING'
            `,
            session.orgId,
            normalizedEmail
        );

        const { rawToken, tokenHash } = generateInviteToken();
        const expiresAt = getInviteExpiry(72);

        const inserted = await prisma.$queryRawUnsafe<Array<{
            id: string;
            email: string;
            orgRole: string;
            expiresAt: string;
        }>>(
            `
            INSERT INTO "OrgInvite" (
                "orgId", email, "orgRole", "tokenHash", status,
                "invitedByUserId", "expiresAt", "createdAt", "updatedAt"
            )
            VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, NOW(), NOW())
            RETURNING id, email, "orgRole", "expiresAt"
            `,
            session.orgId,
            normalizedEmail,
            normalizedRole,
            tokenHash,
            session.userId,
            expiresAt
        );

        const [organization, inviter] = await Promise.all([
            prisma.organization.findUnique({ where: { id: session.orgId }, select: { name: true } }),
            prisma.user.findUnique({ where: { id: session.userId }, select: { name: true, email: true } }),
        ]);

        const inviteUrl = buildInviteUrl(rawToken);
        const inviterName = inviter?.name || inviter?.email || "Your team";
        const organizationName = organization?.name || "your organization";

        const mailResult = await sendTeamInviteEmail({
            email: normalizedEmail,
            inviterName,
            organizationName,
            role: normalizedRole,
            inviteUrl,
            expiresAt,
        });

        return NextResponse.json({
            success: true,
            invite: inserted[0] || null,
            emailSent: Boolean(mailResult?.success),
            inviteUrl: process.env.NODE_ENV === "development" ? inviteUrl : undefined,
            warning: mailResult?.success ? null : "Invite stored but email delivery failed. Check RESEND_API_KEY/FROM_EMAIL.",
        });
    } catch (error) {
        console.error("Invite team error:", error);
        return NextResponse.json({ error: "Failed to invite member" }, { status: 500 });
    }
}
