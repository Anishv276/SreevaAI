
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDriveSchema, bulkDeleteSchema, driveQuerySchema } from "@/lib/validation";
import { z } from "zod";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status");

        const where = {}; // No status filtering since status column was removed

        const drives = await prisma.drive.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: {
                _count: {
                    select: { applications: true },
                },
            },
        });

        const formattedDrives = drives.map((drive: any) => ({
            ...drive,
            applicants: drive._count?.applications || 0,
            daysLeft: Math.max(0, Math.ceil((new Date(drive.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now()) / (1000 * 60 * 60 * 24))),
            aiScreening: {
                enabled: drive.interviewEnabled,
                weights: { threshold: drive.screeningThreshold || 60 }
            },
            registrationFields: drive.registrationFields ? JSON.parse(drive.registrationFields) : [],
            extractedDetails: drive.extractedDetails ? JSON.parse(drive.extractedDetails) : {}
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
                role: data.role || null,
                department: data.department,
                type: data.employmentType || data.type || "Full-time",
                workMode: data.workMode || "Remote",
                positions: data.positions || 1,
                deadline: deadline,
                interviewEnabled: data.interviewEnabled ?? true,
                interviewLanguage: data.interviewLanguage || "English",
                interviewTime: data.interviewTime || 10,
                proctoringLevel: data.interviewAntiCheat || "Medium",
                aiFollowUpDepth: data.interviewFollowUp || 3,
                interviewQuestions: JSON.stringify(data.interviewQuestions || []),
                salary: data.salary || null,
                experience: data.experience || null,
                skills: data.skills || null,
                responsibilities: data.responsibilities || null,
                requirements: data.requirements || null,
                extractedDetails: JSON.stringify(data.extractedDetails || {}),
                jdFileName: data.jdFileName || null,
                jdPreviewUrl: data.jdPreviewUrl || null,
                registrationFields: JSON.stringify(data.registrationFields || []),
                screeningThreshold: data.screeningThreshold || 0,
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
