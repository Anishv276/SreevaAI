import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET() {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { name: true, email: true, phone: true }
        });

        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        return NextResponse.json(user);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const body = await request.json();
        const { name, phone, newPassword, currentPassword, otp } = body;

        // ── 0. LOAD USER ───────────────────────────────────
        let user: any = await prisma.superAdmin.findUnique({ where: { id: session.userId } });
        let table: 'user' | 'superAdmin' = "superAdmin";

        if (!user) {
            user = await prisma.user.findUnique({ where: { id: session.userId } });
            table = "user";
        }

        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone;

        // ── 1. PASSWORD UPDATE LOGIC ────────────────────────
        if (newPassword) {
            if (newPassword.length < 6) {
                return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
            }

            // OTP VERIFICATION (Mandatory for SuperAdmin or if provided)
            if (session.role === "SUPER_ADMIN" || otp) {
                if (!otp) return NextResponse.json({ error: "Security code (OTP) required" }, { status: 400 });

                const vtTable = (prisma as any).verificationToken;
                const validToken = await vtTable.findFirst({
                    where: { 
                        token: otp, 
                        superAdminId: session.userId,
                        expires: { gt: new Date() }
                    }
                });

                if (!validToken) {
                    return NextResponse.json({ error: "Invalid or expired security code" }, { status: 400 });
                }
                await vtTable.delete({ where: { id: validToken.id } });
            }

            // Verify current password
            if (!user.password) {
                // If user has no password (rare but possible with some auth flows), we allow setting one? 
                // Usually best to check if it's required.
            } else if (currentPassword) {
                const valid = await bcrypt.compare(currentPassword, user.password);
                if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
            } else if (table === "superAdmin") {
                 return NextResponse.json({ error: "Current password required to change password" }, { status: 400 });
            }

            updateData.password = await bcrypt.hash(newPassword, 10);
        }

        // ── 2. EXECUTE UPDATE ──────────────────────────────
        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ message: "No changes provided" });
        }

        if (table === "superAdmin") {
            await prisma.superAdmin.update({
                where: { id: session.userId },
                data: updateData,
            });
        } else {
            await prisma.user.update({
                where: { id: session.userId },
                data: updateData,
            });
        }

        return NextResponse.json({ success: true, message: "Profile updated successfully" });
    } catch (error) {
        console.error("Error updating password:", error);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}
