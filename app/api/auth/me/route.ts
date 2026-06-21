import { NextRequest, NextResponse } from "next/server";
import { getSession, refreshSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgRestrictedStatus } from "@/lib/interview-quota";
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (session && session.orgId) {
        const org = await prisma.organization.findUnique({
            where: { id: session.orgId },
            select: { status: true }
        });
        if (!org || (!isOrgRestrictedStatus(org.status) && String(org.status || "").toUpperCase() !== "ACTIVE")) {
            // Org is deleted or has an invalid status, session is invalid
            return NextResponse.json(null);
        }
    }
    const response = NextResponse.json(session || null, {
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        }
    });
    if (session) {
        return refreshSessionCookie(req, response);
    }
    return response;
}
