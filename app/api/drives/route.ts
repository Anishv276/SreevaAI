
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDriveSchema, bulkDeleteSchema, driveQuerySchema } from "@/lib/validation";
import { z } from "zod";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status");

        const queryResult = driveQuerySchema.safeParse({ status });
        if (!queryResult.success) {
            return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
        }

        const where = queryResult.data.status ? { status: queryResult.data.status } : {};

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
                enabled: (drive as any).aiScreeningEnabled,
                weights: (drive as any).aiScreeningWeights ? JSON.parse((drive as any).aiScreeningWeights) : {}
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
                location: data.location || "Remote",
                type: data.employmentType || data.type || "Full-time",
                status: data.status || "ACTIVE",
                workMode: data.workMode || "Remote",
                positions: data.positions || 1,
                deadline: deadline,
                aiScreeningEnabled: data.aiScreening?.enabled ?? true,
                aiScreeningWeights: JSON.stringify(data.aiScreening?.weights || {}),
                salary: data.salary || null,
                experience: data.experience || null,
                skills: data.skills || null,
                responsibilities: data.responsibilities || null,
                extractedDetails: JSON.stringify(data.extractedDetails || {}),
                assessmentCount: data.assessmentCount ?? 5,
                assessmentDifficulty: data.assessmentDifficulty ?? "Medium",
                assessmentTypes: "MIXED",
                assessmentTime: data.assessmentTime ?? 15,
                assessmentMode: data.assessmentMode ?? "TEST",
                proctoringEnabled: true,
                webcamMonitoring: true,
                registrationFields: JSON.stringify(data.registrationFields || []),
                creator: {
                    connectOrCreate: {
                        where: { email: "admin@lumoscale" },
                        create: {
                            email: "admin@lumoscale",
                            name: "Vamsi Admin",
                            role: "HR_ADMIN",
                        },
                    },
                },
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
        const body = await request.json();

        const result = bulkDeleteSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { ids } = result.data;

        await prisma.$transaction([
            prisma.assessmentQuestion.deleteMany({
                where: { assessment: { application: { driveId: { in: ids } } } }
            }),
            prisma.assessmentResponse.deleteMany({
                where: { assessment: { application: { driveId: { in: ids } } } }
            }),
            prisma.assessment.deleteMany({
                where: { application: { driveId: { in: ids } } }
            }),
            prisma.application.deleteMany({
                where: { driveId: { in: ids } }
            }),
            prisma.drive.deleteMany({
                where: { id: { in: ids } }
            })
        ]);

        return NextResponse.json({ message: `${ids.length} drives deleted successfully` });
    } catch (error) {
        console.error("Error bulk deleting drives:", error);
        return NextResponse.json({ error: "Failed to delete drives" }, { status: 500 });
    }
}
