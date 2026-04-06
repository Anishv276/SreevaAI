import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/mail";
import { SignJWT } from "jose";

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "lumoscale-super-secret-jwt-key-2026"
);

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        // Security: Only Super Admins can initialize this flow
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
        }

        const { id } = await params;

        // 1. Find the organization and its primary admin
        const org = await prisma.organization.findUnique({
            where: { id },
            include: {
                users: {
                    where: { role: "ORG_ADMIN" },
                    select: { id: true, name: true, email: true }
                }
            }
        });

        if (!org || !org.users[0]) {
            return NextResponse.json({ error: "Primary administrator not found for this organization" }, { status: 404 });
        }

        const admin = org.users[0];

        // 2. Generate a secure, short-lived reset token (1 hour)
        const token = await new SignJWT({ userId: admin.id, email: admin.email, purpose: "password-reset" })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("1h")
            .sign(SECRET);

        // 3. Construct the reset link
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const resetLink = `${baseUrl}/auth/reset-password?token=${token}`;

        // 4. Send the email
        const mailResult = await sendPasswordResetEmail({
            email: admin.email,
            name: admin.name || "Administrator",
            resetLink
        });

        if (!mailResult.success) {
            return NextResponse.json({ error: "Failed to dispatch reset email" }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            message: `Reset flow initialized for ${admin.email}`,
            // In dev, we return the token/link for convenience
            ...(process.env.NODE_ENV !== 'production' && { debugLink: resetLink })
        });

    } catch (error) {
        console.error("[RESET_PASSWORD_ERROR]:", error);
        return NextResponse.json({ error: "Internal server error during reset flow" }, { status: 500 });
    }
}
