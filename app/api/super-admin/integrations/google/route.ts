import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const admin = await prisma.superAdmin.findUnique({
            where: { id: session.userId },
            select: { googleEmail: true },
        });

        if (admin?.googleEmail) {
            return NextResponse.json({
                isConnected: true,
                email: admin.googleEmail,
            });
        }

        return NextResponse.json({
            isConnected: false,
        });
    } catch (error) {
        console.error("[SUPER_ADMIN_GOOGLE_GET]", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE() {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await prisma.superAdmin.update({
            where: { id: session.userId },
            data: {
                googleAccessToken: null,
                googleRefreshToken: null,
                googleTokenExpiresAt: null,
                googleEmail: null,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[SUPER_ADMIN_GOOGLE_DELETE]", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
