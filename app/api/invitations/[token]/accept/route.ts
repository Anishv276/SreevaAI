import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { hashInviteToken, normalizeOrgRole } from "@/lib/invite";
import { generateId } from "@/lib/ids";

type InviteRow = {
    id: string;
    orgId: string;
    email: string;
    orgRole: string;
    status: string;
    expiresAt: string;
};

export async function POST(
    request: Request,
    context: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await context.params;
        if (!token) return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });

        const { name, password } = await request.json();
        const normalizedName = String(name || "").trim();
        const normalizedPassword = String(password || "").trim();

        if (!normalizedName) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        if (normalizedPassword.length < 6) {
            return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
        }

        const tokenHash = hashInviteToken(token);
        const hashedPassword = await bcrypt.hash(normalizedPassword, 10);

        const accepted = await prisma.$transaction(async (tx) => {
            const inviteRows = await tx.$queryRawUnsafe<InviteRow[]>(
                `
                SELECT id, "orgId", email, "orgRole", status, "expiresAt"
                FROM "OrgInvite"
                WHERE "tokenHash" = $1
                LIMIT 1
                `,
                tokenHash
            );

            const invite = inviteRows?.[0];
            if (!invite) throw new Error("INVITE_NOT_FOUND");

            if (invite.status !== "PENDING") throw new Error(`INVITE_${invite.status}`);

            if (new Date(invite.expiresAt).getTime() <= Date.now()) {
                await tx.$executeRawUnsafe(
                    `
                    UPDATE "OrgInvite"
                    SET status = 'EXPIRED', "updatedAt" = NOW()
                    WHERE id = $1
                    `,
                    invite.id
                );
                throw new Error("INVITE_EXPIRED");
            }

            const existingUser = await tx.user.findUnique({ where: { email: invite.email } });
            if (existingUser?.orgId && existingUser.orgId !== invite.orgId) {
                throw new Error("USER_OTHER_ORG");
            }

            const baseData = {
                name: normalizedName,
                password: hashedPassword,
                role: "ADMIN",
                orgId: invite.orgId,
            };

            const user = existingUser
                ? await tx.user.update({ where: { id: existingUser.id }, data: baseData })
                : await tx.user.create({ data: { id: generateId("usr", normalizedName || invite.email.split("@")[0]), email: invite.email, ...baseData } });

            await tx.$executeRawUnsafe(
                `
                UPDATE "User"
                SET "orgRole" = $1, "updatedAt" = NOW()
                WHERE id = $2
                `,
                normalizeOrgRole(invite.orgRole),
                user.id
            );

            const updated = await tx.$executeRawUnsafe(
                `
                UPDATE "OrgInvite"
                SET status = 'ACCEPTED', "respondedAt" = NOW(), "acceptedAt" = NOW(), "acceptedUserId" = $1, "updatedAt" = NOW()
                WHERE id = $2::uuid AND status = 'PENDING'
                `,
                user.id,
                invite.id
            );

            if (!updated) throw new Error("INVITE_ALREADY_PROCESSED");

            return {
                id: user.id,
                email: user.email,
                name: user.name || normalizedName,
                orgId: user.orgId,
            };
        });

        const tokenValue = await createSession({
            userId: accepted.id,
            email: accepted.email,
            name: accepted.name,
            role: "ADMIN",
            orgId: accepted.orgId || null,
        });

        const response = NextResponse.json({ success: true, redirectTo: "/admin" });
        response.cookies.set("session", tokenValue, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 7,
            path: "/",
        });

        return response;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "UNKNOWN";

        if (message === "INVITE_NOT_FOUND") {
            return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
        }

        if (message === "INVITE_EXPIRED") {
            return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
        }

        if (message.startsWith("INVITE_") || message === "INVITE_ALREADY_PROCESSED") {
            return NextResponse.json({ error: "Invitation already handled" }, { status: 409 });
        }

        if (message === "USER_OTHER_ORG") {
            return NextResponse.json({ error: "This email already belongs to another organization" }, { status: 409 });
        }

        console.error("Accept invitation error:", error);
        return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
    }
}
