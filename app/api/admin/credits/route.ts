import { NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/auth";
import { isSuperAdminRole } from "@/lib/auth";
import { getOrgBillingStatus } from "@/lib/credits";
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session || (!isAdminRole(session.role) && !isSuperAdminRole(session.role))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        // Only an explicit query param -- the Referer header is client-controlled
        // and easily spoofed/stripped, so it's not a trustworthy source for
        // deciding which org's data a super-admin gets to view.
        const { searchParams } = new URL(request.url);
        const requestedOrgId = searchParams.get("orgId")?.trim() || null;
        const orgId = isSuperAdminRole(session.role) ? (requestedOrgId || session.orgId) : session.orgId;
        if (!orgId) {
            return NextResponse.json({ error: "Organization required" }, { status: 400 });
        }
        const status = await getOrgBillingStatus(orgId);
        let usageMetrics: Record<string, unknown> | null = null;
        if (isSuperAdminRole(session.role)) {
            const { prisma } = await import("@/lib/prisma");
            const { Prisma } = await import("@prisma/client");
            const rows = await prisma.$queryRaw<Array<{ platformUsageMetrics: unknown }>>(
                Prisma.sql`SELECT "platformUsageMetrics" FROM "OrganizationDetails" WHERE id = ${orgId} LIMIT 1`
            );
            const raw = rows[0]?.platformUsageMetrics;
            usageMetrics = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
        }
        return NextResponse.json({ ...status, ...(usageMetrics !== null ? { usageMetrics } : {}) }, {
            headers: { 'Cache-Control': 'private, max-age=60' }
        });
    } catch (error) {
        console.error("[CREDITS] GET error:", error);
        return NextResponse.json({ error: "Failed to fetch credits" }, { status: 500 });
    }
}
