import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const org = await prisma.organization.findUnique({
            where: { id: session.orgId },
            select: {
                name: true,
                industry: true,
                size: true,
                website: true,
                logoUrl: true,
                customDomain: true,
                resendDomainId: true,
                isDomainVerified: true,
                customSenderEmail: true,
                customSenderName: true,
                onboardingStep: true,
                onboardingComplete: true,
                location: true,
                phone: true,
                jobTitle: true,
                expectedDrives: true,
                expectedCandidates: true,
                expectedInterviews: true,
            }
        });

        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        return NextResponse.json(org);
    } catch (error) {
        console.error("Error fetching organization:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { name, industry, size, website, location, logoUrl } = body;

        // Cleanup old logo if it's being replaced or removed
        if (logoUrl !== undefined) {
            const currentOrg = await prisma.organization.findUnique({
                where: { id: session.orgId },
                select: { logoUrl: true }
            });

            const shouldDelete = currentOrg?.logoUrl && (!logoUrl || currentOrg.logoUrl !== logoUrl);

            console.log("[DEBUG_LOGO_DELETE]:", {
                currentLogo: currentOrg?.logoUrl,
                newLogo: logoUrl,
                shouldDelete
            });

            if (shouldDelete) {
                try {
                    const { deleteObject, getKeyFromUrl } = await import("@/lib/s3");
                    const key = getKeyFromUrl(currentOrg.logoUrl || "");
                    console.log("[DEBUG_LOGO_DELETE_KEY]:", key);
                    
                    if (key) {
                        const bucket = process.env.R2_LOGOS_BUCKET || "logos";
                        const success = await deleteObject(bucket, key);
                        console.log("[DEBUG_LOGO_DELETE_RESULT]:", success);
                    }
                } catch (err) {
                    console.error("[DEBUG_LOGO_DELETE_FATAL]:", err);
                }
            }
        }

        const updatedOrg = await prisma.organization.update({
            where: { id: session.orgId },
            data: {
                name,
                industry,
                size,
                website,
                location,
                logoUrl: logoUrl?.startsWith("blob:") ? undefined : logoUrl
            }
        });

        return NextResponse.json(updatedOrg);
    } catch (error) {
        console.error("Error updating organization:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
