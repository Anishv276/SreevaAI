import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { validatePasswordStrength } from "@/lib/validation";

// POST /api/super-admin/orgs/[id]/reset-password
// Resets the primary org admin password for the given organization.
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const newPassword = typeof body?.newPassword === "string" ? body.newPassword.trim() : "";

        if (!newPassword) {
            return NextResponse.json({ error: "newPassword is required" }, { status: 400 });
        }

        const { isValid, error } = validatePasswordStrength(newPassword);
        if (!isValid) {
            return NextResponse.json({ error }, { status: 400 });
        }

        const org = await prisma.organization.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                users: {
                    where: { role: "ORG_ADMIN" },
                    orderBy: { createdAt: "asc" },
                    select: { id: true, email: true, name: true },
                },
            },
        });

        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        const primaryAdmin = org.users[0];
        if (!primaryAdmin) {
            return NextResponse.json({ error: "No org admin found for this organization" }, { status: 404 });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: primaryAdmin.id },
            data: { password: hashedPassword },
        });

        return NextResponse.json({
            success: true,
            message: `Password reset for ${primaryAdmin.email}`,
            orgId: org.id,
            orgName: org.name,
            adminEmail: primaryAdmin.email,
        });
    } catch (error) {
        console.error("Error resetting org admin password:", error);
        return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
    }
}
