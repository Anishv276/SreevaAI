import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { validatePasswordStrength } from "@/lib/validation";

export async function GET() {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        console.log(`[Profile API] Fetching profile for userId: ${session.userId}, role: ${session.role}`);

        let user: any = null;

        if (session.role === "SUPER_ADMIN") {
            user = await prisma.superAdmin.findUnique({
                where: { id: session.userId },
                select: { name: true, email: true } // SuperAdmin has no phone column now
            });
        } else {
            // ADMIN or others (regular users)
            user = await prisma.user.findUnique({
                where: { id: session.userId },
                select: { name: true, email: true, phone: true }
            });
        }

        if (!user) {
            console.error(`[Profile API] User record not found for ID: ${session.userId}`);
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json(user);
    } catch (error) {
        console.error("[Profile API GET Error]:", error);
        return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const body = await request.json();
        const { name, phone, newPassword, currentPassword, otp } = body;

        console.log(`[Profile API] Updating profile for userId: ${session.userId}, role: ${session.role}`);

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        
        // Only include phone if updating a non-SuperAdmin user (or if we eventually add it to SuperAdmin)
        if (phone !== undefined && session.role !== "SUPER_ADMIN") {
            updateData.phone = phone;
        }

        // 1. Password Update Logic
        if (newPassword) {
            const { isValid, error: strengthError } = validatePasswordStrength(newPassword);
            if (!isValid) return NextResponse.json({ error: strengthError }, { status: 400 });

            // Fetch current user with password for verification
            let currentUser: any = null;
            if (session.role === "SUPER_ADMIN") {
                currentUser = await prisma.superAdmin.findUnique({ where: { id: session.userId } });
            } else {
                currentUser = await prisma.user.findUnique({ where: { id: session.userId } });
            }

            if (!currentUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

            // SuperAdmin security check (OTP)
            if (session.role === "SUPER_ADMIN") {
                if (!otp) return NextResponse.json({ error: "Security code (OTP) required" }, { status: 400 });
                const validToken = await prisma.verificationToken.findFirst({
                    where: { 
                        token: otp, 
                        superAdminId: session.userId, 
                        expires: { gt: new Date() } 
                    }
                });
                if (!validToken) return NextResponse.json({ error: "Invalid or expired security code" }, { status: 400 });
                await prisma.verificationToken.delete({ where: { id: validToken.id } });
            }

            // Verify current access rights
            if (currentUser.password) {
                if (!currentPassword) return NextResponse.json({ error: "Current password required to authorize changes" }, { status: 400 });
                const valid = await bcrypt.compare(currentPassword, currentUser.password);
                if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
            } else if (session.role !== "SUPER_ADMIN") {
                // Prevent "claiming" password-less accounts via hijacked sessions
                return NextResponse.json({ 
                    error: "Security Check: Account has no password. To establish one, please use the password recovery protocol via email." 
                }, { status: 403 });
            }
            // Note: SuperAdmin is already verified by OTP above, so they can proceed.

            updateData.password = await bcrypt.hash(newPassword, 10);
        }

        if (Object.keys(updateData).length === 0) return NextResponse.json({ message: "No changes provided" });

        // 2. Execute Update
        if (session.role === "SUPER_ADMIN") {
            await prisma.superAdmin.update({
                where: { id: session.userId },
                data: updateData
            });
        } else {
            await prisma.user.update({
                where: { id: session.userId },
                data: updateData
            });
        }

        return NextResponse.json({ success: true, message: "Profile updated successfully" });
    } catch (error) {
        console.error("[Profile API PATCH Error]:", error);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}
