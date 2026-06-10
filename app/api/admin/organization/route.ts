import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";

function getRequestedOrgId(request: Request) {
    const url = new URL(request.url);
    const explicitOrgId = url.searchParams.get("orgId")?.trim() || "";
    if (explicitOrgId) return explicitOrgId;
    const referer = request.headers.get("referer") || "";
    if (!referer) return "";
    try {
        return new URL(referer).searchParams.get("orgId")?.trim() || "";
    } catch {
        return "";
    }
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
            plan: string | null;
            website: string | null;
            logoUrl: string | null;
            onboardingComplete: boolean | null;
            status: string | null;
            statusControl: string | null;
            voiceId: string | null;
            allowedVoices: string[] | null;
            deepgramModel: string | null;
            maxActiveDrives: string | null;
            proctoringSignals: unknown;
            interviewQuotaTotal: number | null;
            interviewQuotaUsed: number | null;
            activeDriveCount: number | null;
        }>>(
            Prisma.sql`
                SELECT
                    o.name,
                    o.plan,
                    o.website,
                    o."logoUrl",
                    o."onboardingComplete",
                    o.status,
                    o."statusControl",
                    o."voiceId",
                    o."allowedVoices",
                    o."deepgramModel",
                    o."maxActiveDrives",
                    o."proctoringSignals",
                    o."interviewQuotaTotal",
                    o."interviewQuotaUsed",
                    (
                        SELECT COUNT(*)
                        FROM "Drive" d
                        WHERE d."orgId" = o.id
                    )::INT AS "activeDriveCount"
                FROM "Organization" o
                WHERE o.id = ${orgId}
                LIMIT 1
            `
        );

        const org = orgRows[0];
        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        let effectiveStatus = String(org.status || "ACTIVE").toUpperCase();
        if ((org as any).statusControl === "QUOTA" && (org as any).interviewQuotaTotal > 0 && (org as any).interviewQuotaUsed >= (org as any).interviewQuotaTotal) {
            effectiveStatus = "QUOTA_EXCEEDED";
        }

        return NextResponse.json({
            ...org,
            status: effectiveStatus,
            activeDriveCount: Number(org.activeDriveCount ?? 0),
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
        const { name, website, logoUrl } = body;

        const data: Record<string, any> = {};
        if (name !== undefined) data.name = name;
        if (website !== undefined) data.website = website;

        if (logoUrl !== undefined) {
            const currentOrg = await prisma.organization.findUnique({
                where: { id: session.orgId },
                select: { logoUrl: true }
            });
            const shouldDelete = currentOrg?.logoUrl && (!logoUrl || currentOrg.logoUrl !== logoUrl);
            if (shouldDelete) {
                try {
                    const { deleteObject, getKeyFromUrl } = await import("@/lib/s3");
                    const key = getKeyFromUrl(currentOrg.logoUrl || "");
                    if (key) await deleteObject(process.env.R2_LOGOS_BUCKET || "logos", key);
                } catch (err) {
                    console.error("Logo delete failed:", err);
                }
            }
            if (!logoUrl?.startsWith("blob:")) data.logoUrl = logoUrl;
        }

        const updatedOrg = await prisma.organization.update({
            where: { id: session.orgId },
            data
        });

        return NextResponse.json(updatedOrg);
    } catch (error) {
        console.error("Error updating organization:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
