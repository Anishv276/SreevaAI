import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const activeDriveCount = await prisma.drive.count({
            where: { orgId: session.orgId }
        });

        const org = await prisma.organization.findUnique({
            where: { id: session.orgId },
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
                ttsProvider: true,
                cartesiaVoiceId: true,
                cartesiaModel: true,
                sarvamVoice: true,
                sarvamModel: true,
                googleModel: true,
                googleVoiceName: true,
                sttProvider: true,
                deepgramModel: true,
                sarvamSttModel: true,
                llmProvider: true,
                llmModel: true,
                llmTemperature: true,
                maxActiveDrives: true,
                proctoringSignals: true,
            }
        });

        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        return NextResponse.json({
            ...org,
            activeDriveCount,
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
