import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/super-admin/orgs/[id] — fetch org for editing
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const org = await prisma.organization.findUnique({
            where: { id },
            include: {
                users: {
                    where: { role: "ORG_ADMIN" },
                    select: { id: true, name: true, email: true }
                }
            }
        });

        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        return NextResponse.json(org);
    } catch (error) {
        console.error("Error fetching org:", error);
        return NextResponse.json({ error: "Failed to fetch organization" }, { status: 500 });
    }
}

// PATCH /api/super-admin/orgs/[id] — update org (suspend, change plan, etc.)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { name, plan, isActive, logoUrl, slug } = body;

        const updated = await prisma.organization.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(plan !== undefined && { plan }),
                ...(isActive !== undefined && { isActive }),
                ...(logoUrl !== undefined && { logoUrl }),
                ...(slug !== undefined && { slug }),
            },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating org:", error);
        return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
    }
}

// DELETE /api/super-admin/orgs/[id] — remove org and all its data
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Get all drives for this org to cascade delete applications
        const drives = await prisma.drive.findMany({ where: { orgId: id }, select: { id: true } });
        const driveIds = drives.map(d => d.id);

        await prisma.$transaction([
            prisma.application.deleteMany({ where: { driveId: { in: driveIds } } }),
            prisma.drive.deleteMany({ where: { orgId: id } }),
            prisma.user.deleteMany({ where: { orgId: id } }),
            prisma.organization.delete({ where: { id } }),
        ]);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting org:", error);
        return NextResponse.json({ error: "Failed to delete organization" }, { status: 500 });
    }
}
