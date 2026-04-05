import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const session = await getSession();
    
    if (session && session.orgId) {
        const org = await prisma.organization.findUnique({
            where: { id: session.orgId },
            select: { isActive: true }
        });
        
        if (!org || !org.isActive) {
            // Org is suspended or deleted, session is invalid
            return NextResponse.json(null);
        }
    }
    
    return NextResponse.json(session || null);
}
