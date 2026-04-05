
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDriveSchema, bulkDeleteSchema, driveQuerySchema } from "@/lib/validation";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status");

        const queryResult = driveQuerySchema.safeParse({ status });
        if (!queryResult.success) {
            return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
        }

        // ── SECURITY: Filter by Org ─────────────────────────
        const targetOrgId = new URL(request.url).searchParams.get("orgId"); let where: any = {}; if (session.role === "SUPER_ADMIN") { if (targetOrgId) where.orgId = targetOrgId; } else { where.orgId = session.orgId; }
        if (queryResult.data.status) where.status = queryResult.data.status;

        const drives = await prisma.drive.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: {
                _count: {
                    select: { applications: true },
                },
            },
        });

        const formattedDrives = drives.map((drive) => ({
            ...drive,
            applicants: drive._count.applications,
            daysLeft: Math.max(0, Math.ceil((new Date(drive.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now()) / (1000 * 60 * 60 * 24))),
            aiScreening: {
                enabled: (drive as any).aiScreeningEnabled
            },
            registrationFields: (drive as any).registrationFields ? JSON.parse((drive as any).registrationFields) : [],
            extractedDetails: (drive as any).extractedDetails ? JSON.parse((drive as any).extractedDetails) : {}
        }));

        return NextResponse.json(formattedDrives);
    } catch (error) {
        console.error("Error fetching drives:", error);
        return NextResponse.json({ error: "Failed to fetch drives" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const body = await request.json();

        const result = createDriveSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const data = result.data;
        const deadline = data.deadline ? new Date(data.deadline) : null;

        const drive = await prisma.drive.create({
            data: {
                title: data.title,
                description: data.description || "",
                department: data.department,
                type: data.employmentType || data.type || "Full-time",
                status: data.status || "ACTIVE",
                workMode: data.workMode || "Remote",
                positions: data.positions || 1,
                deadline: deadline,
                aiScreeningEnabled: data.aiScreening?.enabled ?? true,
                salary: data.salary || null,
                experience: data.experience || null,
                skills: data.skills || null,
                responsibilities: data.responsibilities || null,
                extractedDetails: JSON.stringify(data.extractedDetails || {}),
                registrationFields: JSON.stringify(data.registrationFields || []),
                orgId: session.orgId,
                creatorId: session.userId,
            } as any,
        });

        return NextResponse.json(drive);
    } catch (error: any) {
        console.error("Error creating drive:", error);
        return NextResponse.json({ 
            error: "Failed to create drive", 
            details: error.message,
            code: error.code 
        }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const body = await request.json();

        const result = bulkDeleteSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { ids } = result.data;

        // ── SECURITY: Ensure IDs belong to the Org ───────────
        const belongsToOrg = await prisma.drive.findMany({
            where: { id: { in: ids }, orgId: session.orgId } as any,
            select: { id: true },
        });

        const validIds = belongsToOrg.map(d => d.id);
        if (validIds.length === 0) return NextResponse.json({ message: "No matching drives found" });

        await prisma.$transaction([
            prisma.application.deleteMany({
                where: { driveId: { in: validIds } }
            }),
            prisma.drive.deleteMany({
                where: { id: { in: validIds } }
            })
        ]);

        return NextResponse.json({ message: `${validIds.length} drives deleted successfully` });
    } catch (error) {
        console.error("Error bulk deleting drives:", error);
        return NextResponse.json({ error: "Failed to delete drives" }, { status: 500 });
    }
}
