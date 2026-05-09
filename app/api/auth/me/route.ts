import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgRestrictedStatus } from "@/lib/interview-quota";

export async function GET() {
    const session = await getSession();
    
    if (session && session.orgId) {
        const org = await prisma.organization.findUnique({
            where: { id: session.orgId },
            select: { status: true }
        } as any);
        
        if (!org || !isOrgRestrictedStatus(org.status) && String(org.status || "").toUpperCase() !== "ACTIVE") {
            // Org is deleted or has an invalid status, session is invalid
            return NextResponse.json(null);
        }
    }
    
    return NextResponse.json(session || null);
}
