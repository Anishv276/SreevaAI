import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/admin/profile — returns org-level profile details (name, phone, jobTitle) + user email
export async function GET() {
    try {
        const session = await getSession();
        if (!session?.orgId || !session?.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [org, user] = await Promise.all([
            prisma.organization.findUnique({
                where: { id: session.orgId },
                select: { name: true, phone: true, jobTitle: true }
            }),
            prisma.user.findUnique({
                where: { id: session.userId },
                select: { email: true }
            })
        ]);

        if (!org || !user) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        return NextResponse.json({
            name: org.name || "",
            phone: org.phone || "",
            jobTitle: org.jobTitle || "",
            email: user.email || "",
        });
    } catch (error) {
        console.error("Error fetching profile:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// PATCH /api/admin/profile — update org-level profile fields
export async function PATCH(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { name, phone, jobTitle } = body;

        const updatedOrg = await prisma.organization.update({
            where: { id: session.orgId },
            data: {
                name: name || undefined,
                phone: phone || undefined,
                jobTitle: jobTitle || undefined,
            },
            select: { name: true, phone: true, jobTitle: true }
        });

        return NextResponse.json(updatedOrg);
    } catch (error) {
        console.error("Error updating profile:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
