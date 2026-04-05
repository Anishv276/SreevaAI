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
                logoUrl: true
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
        const { name, industry, size, website, logoUrl } = body;

        const updatedOrg = await prisma.organization.update({
            where: { id: session.orgId },
            data: {
                name,
                industry,
                size,
                website,
                logoUrl
            }
        });

        return NextResponse.json(updatedOrg);
    } catch (error) {
        console.error("Error updating organization:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
