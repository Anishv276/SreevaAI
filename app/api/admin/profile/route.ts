import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";
export async function GET() {
    try {
        const session = await getSession();
        if (!session?.orgId || !session?.userId || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const user = await prisma.organizationCredentials.findUnique({
            where: { id: session.userId },
            select: { name: true, email: true }
        });
        if (!user) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json({
            name: user.name || "",
            email: user.email || "",
        });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/admin/profile",
            method: "GET",
            error,
            body: { error: "Internal Server Error" },
            status: 500,
            logLabel: "Error fetching profile:",
        });
    }
}
export async function PATCH(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId || !session?.userId || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { name } = await req.json();
        const updatedUser = await prisma.organizationCredentials.update({
            where: { id: session.userId },
            data: { name: name || undefined },
            select: { name: true }
        });
        return NextResponse.json(updatedUser);
    } catch (error) {
        return apiErrorResponse({
            route: "/api/admin/profile",
            method: "PATCH",
            error,
            body: { error: "Internal Server Error" },
            status: 500,
            logLabel: "Error updating profile:",
        });
    }
}
