import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const session = await getSession();
    
    if (session && session.orgId) {
        const org = await prisma.organization.findUnique({
            where: { id: session.orgId },
            select: { status: true }
        } as any);
        
        if (!org || (org.status !== 'ACTIVE' && org.status !== 'SUSPENDED' && org.status !== 'CLOSED')) {
            // Org is deleted or has an invalid status, session is invalid
            return NextResponse.json(null);
        }
    }
    
    return NextResponse.json(session || null);
}
