import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, invalidateUserSessions } from "@/lib/auth";
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
        const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword.trim() : "";

        if (!newPassword) {
            return NextResponse.json({ error: "newPassword is required" }, { status: 400 });
        }

        const { isValid, error } = validatePasswordStrength(newPassword);
        if (!isValid) {
            return NextResponse.json({ error }, { status: 400 });
        }

        // SECURITY HANDSHAKE: Verify SuperAdmin's current password
        const superAdmin = await prisma.superAdmin.findUnique({
            where: { id: session.userId },
            select: { password: true }
        });

        if (!superAdmin || !superAdmin.password) {
            return NextResponse.json({ error: "SuperAdmin record not found" }, { status: 404 });
        }

        if (!currentPassword) {
            return NextResponse.json({ error: "Current SuperAdmin password is required for security verification." }, { status: 400 });
        }

        const isMatch = await bcrypt.compare(currentPassword, superAdmin.password);
        if (!isMatch) {
            return NextResponse.json({ error: "Security violation: Invalid SuperAdmin password." }, { status: 401 });
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

        await invalidateUserSessions(primaryAdmin.id);

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
