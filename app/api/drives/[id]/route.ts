import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateDriveSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        
        const drive = await prisma.drive.findFirst({
            where: {
                OR: [
                    { id },
                    { slug: id }
                ]
            },
            include: {
                organization: {
                    select: { 
                        isActive: true,
                        name: true,
                        logoUrl: true,
                        industry: true,
                        size: true,
                        website: true,
                    }
                },
                _count: {
                    select: { applications: true },
                },
            },
        });

        if (!drive) {
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
        }

        if (drive.organization && !drive.organization.isActive) {
            return NextResponse.json({ error: "This organization is currently suspended. Access is restricted." }, { status: 403 });
        }

        return NextResponse.json({
            ...drive,
            applicants: drive._count?.applications || 0,
            daysLeft: Math.max(0, Math.ceil((new Date(drive.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now()) / (1000 * 60 * 60 * 24))),
            aiScreening: {
                enabled: (drive as any).aiScreeningEnabled ?? true,
                weights: {} // Schema doesn't have a weights field yet
            },
            registrationFields: (drive as any).registrationFields ? JSON.parse((drive as any).registrationFields) : [],
            extractedDetails: (drive as any).extractedDetails ? JSON.parse((drive as any).extractedDetails) : {}
        });
    } catch (error: any) {
        console.error("[GET_DRIVE_ERROR]:", error);
        return NextResponse.json({ 
            error: "Failed to fetch drive", 
            details: error.message 
        }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    let driveId: string = "";
    try {
        const { id } = await params;
        driveId = id;

        const body = await request.json();

        const result = updateDriveSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const data = result.data;
        const deadline = data.deadline === "" || data.deadline === null ? null : 
                        (data.deadline && !isNaN(new Date(data.deadline).getTime()) ? new Date(data.deadline) : undefined);
        
        const positions = data.positions !== undefined ? data.positions : undefined;

        const updateData: any = {};
        
        if (data.title !== undefined) updateData.title = data.title;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.role !== undefined) updateData.role = data.role;
        if (data.department !== undefined) updateData.department = data.department;
        if (data.employmentType !== undefined || data.type !== undefined) {
            updateData.type = data.employmentType || data.type;
        }
        if (data.workMode !== undefined) updateData.workMode = data.workMode;
        if (positions !== undefined) updateData.positions = positions;
        if (deadline !== undefined) updateData.deadline = deadline;
        
        if (data.salary !== undefined) updateData.salary = data.salary;
        if (data.experience !== undefined) updateData.experience = data.experience;
        if (data.skills !== undefined) updateData.skills = data.skills;
        if (data.responsibilities !== undefined) updateData.responsibilities = data.responsibilities;
        if (data.extractedDetails !== undefined) updateData.extractedDetails = JSON.stringify(data.extractedDetails);
        if (data.jdFileName !== undefined) updateData.jdFileName = data.jdFileName;
        if (data.jdPreviewUrl !== undefined) {
            updateData.jdPreviewUrl = data.jdPreviewUrl?.startsWith("blob:") ? undefined : data.jdPreviewUrl;
        }
        
        if (data.registrationFields !== undefined) updateData.registrationFields = JSON.stringify(data.registrationFields);
        
        if (data.screeningThreshold !== undefined) updateData.screeningThreshold = data.screeningThreshold;
        
        // Add new interview fields to PATCH
        if (data.interviewEnabled !== undefined) updateData.interviewEnabled = data.interviewEnabled;
        if (data.interviewLanguage !== undefined) updateData.interviewLanguage = data.interviewLanguage;
        if (data.interviewTime !== undefined) updateData.interviewTime = data.interviewTime;
        if (data.interviewAntiCheat !== undefined) updateData.proctoringLevel = data.interviewAntiCheat;
        if (data.interviewFollowUp !== undefined) updateData.aiFollowUpDepth = data.interviewFollowUp;
        if (data.interviewQuestions !== undefined) updateData.interviewQuestions = JSON.stringify(data.interviewQuestions);
        if (data.requirements !== undefined) updateData.requirements = data.requirements;
        if ((data as any).isPassportRequired !== undefined) updateData.isPassportRequired = (data as any).isPassportRequired;
        if ((data as any).shortlistMode !== undefined) updateData.shortlistMode = (data as any).shortlistMode;
        if (data.status !== undefined) updateData.status = data.status;
        
        if (data.aiScreening?.enabled !== undefined) updateData.aiScreeningEnabled = data.aiScreening.enabled;
        


        const updated = await prisma.drive.update({
            where: { id: driveId },
            data: updateData,
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error("Error updating drive:", {
            id: driveId,
            error: error.message,
            stack: error.stack,
            code: error.code
        });
        return NextResponse.json({ 
            error: "Failed to update drive",
            details: error.message,
            code: error.code
        }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const driveId = id;

        // ── STORAGE CLEANUP: Purge JD & Resumes from R2 ──────────
        try {
            // Fetch drive details before deletion to get the R2 links
            const driveWithApps = await prisma.drive.findUnique({
                where: { id: driveId },
                select: {
                    jdPreviewUrl: true,
                    applications: {
                        select: { resumeUrl: true }
                    }
                }
            });

            if (driveWithApps) {
                const { deleteObject, getKeyFromUrl } = await import("@/lib/s3");
                
                // Cleanup JD from "jds" bucket
                if (driveWithApps.jdPreviewUrl) {
                    const key = getKeyFromUrl(driveWithApps.jdPreviewUrl);
                    if (key) await deleteObject(process.env.R2_JDS_BUCKET || "jds", key);
                }

                // Cleanup all Resumes from "resumes" bucket
                for (const app of driveWithApps.applications) {
                    if (app.resumeUrl) {
                        const key = getKeyFromUrl(app.resumeUrl);
                        if (key) await deleteObject(process.env.R2_RESUMES_BUCKET || "resumes", key);
                    }
                }
            }
        } catch (storageErr) {
            console.error("[DELETE_SINGLE_DRIVE_STORAGE_ERROR]:", storageErr);
        }

        await prisma.$transaction([
            prisma.application.deleteMany({
                where: { driveId },
            }),
            prisma.drive.delete({
                where: { id: driveId },
            }),
        ]);

        return NextResponse.json({ message: "Drive deleted successfully" });
    } catch (error) {
        console.error("Error deleting drive:", error);
        return NextResponse.json({ error: "Failed to delete drive" }, { status: 500 });
    }
}
