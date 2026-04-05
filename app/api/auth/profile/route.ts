import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function PATCH(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { newPassword, currentPassword, otp } = await request.json();

        if (!newPassword || newPassword.length < 6) {
            return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
        }

        // ── 0. OTP VERIFICATION (Mandatory for SuperAdmin) ────
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

            // Cleanup OTP after verification
            await vtTable.delete({ where: { id: validToken.id } });
        }

        // ── 1. Check SuperAdmin first ───────────────────────
        let user: any = await prisma.superAdmin.findUnique({ where: { id: session.userId } });
        let table = "superAdmin";

        // ── 2. Check regular User second ──────────────────
        if (!user) {
            user = await prisma.user.findUnique({ where: { id: session.userId } });
            table = "user";
        }

        if (!user || !user.password) return NextResponse.json({ error: "User not found" }, { status: 404 });

        // Verify current password if provided
        if (currentPassword) {
            const valid = await bcrypt.compare(currentPassword, user.password);
            if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        if (table === "superAdmin") {
            await prisma.superAdmin.update({
                where: { id: session.userId },
                data: { password: hashedPassword },
            });
        } else {
            await prisma.user.update({
                where: { id: session.userId },
                data: { password: hashedPassword },
            });
        }

        return NextResponse.json({ success: true, message: "Password updated successfully" });
    } catch (error) {
        console.error("Error updating password:", error);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}
