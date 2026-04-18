import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
    const session = await getSession();
    if (!session?.orgId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const org = await prisma.organization.findUnique({
            where: { id: session.orgId },
            select: {
                googleEmail: true,
                googleAccessToken: true,
            }
        });

        return NextResponse.json({
            isConnected: !!org?.googleAccessToken,
            email: org?.googleEmail || null,
        });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
    }
}

export async function DELETE() {
    const session = await getSession();
    if (!session?.orgId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await prisma.organization.update({
            where: { id: session.orgId },
            data: {
                googleAccessToken: null,
                googleRefreshToken: null,
                googleTokenExpiresAt: null,
                googleEmail: null,
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
    }
}
