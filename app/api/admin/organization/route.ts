import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { getEffectiveOrgStatus } from "@/lib/credits";

function getRequestedOrgId(request: Request) {
    const url = new URL(request.url);
    const explicitOrgId = url.searchParams.get("orgId")?.trim() || "";
    if (explicitOrgId) {
        return explicitOrgId;
    }

    const referer = request.headers.get("referer") || "";
    if (!referer) {
        return "";
    }

    try {
        return new URL(referer).searchParams.get("orgId")?.trim() || "";
    } catch {
        return "";
    }
}

export async function GET(request: Request) {
    try {
        const prismaAny = prisma as any;
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

        const [org, activeDriveCount] = await Promise.all([
            prismaAny.organization.findUnique({
                where: { id: orgId },
                select: {
                    name: true,
                    plan: true,
                    industry: true,
                    size: true,
                    website: true,
                    logoUrl: true,
                    onboardingComplete: true,
                    location: true,
                    status: true,
                    statusControl: true,
                    voiceId: true,
                    allowedVoices: true,
                    deepgramModel: true,
                    maxActiveDrives: true,
                    proctoringSignals: true,

                    interviewQuotaTotal: true,
                    interviewQuotaUsed: true,
                }
            }),
            prisma.drive.count({ where: { orgId } })
        ]);

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
            activeDriveCount,
        }, {
            headers: {
                'Cache-Control': 'private, max-age=120',
            }
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
        const { name, industry, size, website, location, phone, logoUrl } = body;

        // Build update payload - only include fields that were actually sent
        const data: Record<string, any> = {};
        if (name !== undefined) data.name = name;
        if (industry !== undefined) data.industry = industry;
        if (size !== undefined) data.size = size;
        if (website !== undefined) data.website = website;
        if (location !== undefined) data.location = location;

        // Handle logo separately - delete old one from R2 if being replaced
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
