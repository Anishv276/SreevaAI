import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
function getRequestedOrgId(request: Request) {
    // Only an explicit query param -- the Referer header is client-controlled
    // and easily spoofed/stripped, so it's not a trustworthy source for
    // deciding which org's data a super-admin gets to view.
    const url = new URL(request.url);
    return url.searchParams.get("orgId")?.trim() || "";
}
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId && !getRequestedOrgId(request)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const requestedOrgId = getRequestedOrgId(request);
        const sessionOrgId = session?.orgId || "";
        const isSuperAdminContext = isSuperAdminRole(session?.role);
        const orgId = isSuperAdminContext ? (requestedOrgId || sessionOrgId) : sessionOrgId;
        if (!orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const orgRows = await prisma.$queryRaw<Array<{
            name: string | null;
            billingPlan: string | null;
            isOnboardingComplete: boolean | null;
            orgStatus: string | null;
            quotaControlMode: string | null;
            defaultVoiceId: string | null;
            allowedVoiceIds: string[] | null;
            sttModel: string | null;
            maxActiveJobs: string | null;
            enabledProctoringSignals: unknown;
            totalInterviewsAllowed: number | null;
            totalInterviewsUsed: number | null;
            activeJobCount: number | null;
        }>>(
            Prisma.sql`
                SELECT
                    o.name,
                    o."billingPlan",
                    o."isOnboardingComplete",
                    o."orgStatus",
                    o."quotaControlMode",
                    o."defaultVoiceId",
                    o."allowedVoiceIds",
                    o."sttModel",
                    o."maxActiveJobs",
                    o."enabledProctoringSignals",
                    o."totalInterviewsAllowed",
                    o."totalInterviewsUsed",
                    (
                        SELECT COUNT(*)
                        FROM "Job" d
                        WHERE d."organizationId" = o.id AND d."isDeleted" = false
                    )::INT AS "activeJobCount"
                FROM "OrganizationDetails" o
                WHERE o.id = ${orgId} AND o."isDeleted" = false
                LIMIT 1
            `
        );
        const org = orgRows[0];
        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }
        let effectiveStatus = String(org.orgStatus || "ACTIVE").toUpperCase();
        if (org.quotaControlMode === "QUOTA" && (org.totalInterviewsAllowed ?? 0) > 0 && (org.totalInterviewsUsed ?? 0) >= (org.totalInterviewsAllowed ?? 0)) {
            effectiveStatus = "QUOTA_EXCEEDED";
        }
        return NextResponse.json({
            ...org,
            status: effectiveStatus,
            activeJobCount: Number(org.activeJobCount ?? 0),
        }, {
            headers: { 'Cache-Control': 'private, max-age=120' }
        });
    } catch (error) {
        console.error("Error fetching organization:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
export async function PATCH(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized: administrator access required" }, { status: 403 });
        }
        const body = await req.json();
        const { name } = body;
        const data: Record<string, any> = {};
        if (name !== undefined) data.name = name;
        const updatedOrg = await prisma.organizationDetails.update({
            where: { id: session.orgId },
            data
        });
        return NextResponse.json(updatedOrg);
    } catch (error) {
        console.error("Error updating organization:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
