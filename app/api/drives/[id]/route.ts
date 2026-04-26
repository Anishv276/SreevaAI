import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateDriveSchema } from "@/lib/validation";
import { deleteDriveEmbeddings } from "@/lib/pinecone";
import { deleteUrlTargets } from "@/lib/delete-utils";
import { normalizeDriveAiConfig } from "@/lib/ai-provider-config";
import { safeJsonParse } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        
        const drive = await prisma.drive.findFirst({
            where: {
                id
            },
            select: {
                id: true,
                title: true,
                role: true,
                description: true,
                department: true,
                type: true,
                screeningThreshold: true,
                creatorId: true,
                createdAt: true,
                updatedAt: true,
                positions: true,
                workMode: true,
                experience: true,
                responsibilities: true,
                requirements: true,
                salary: true,
                skills: true,
                extractedDetails: true,
                interviewLanguage: true,
                interviewTime: true,
                proctoringLevel: true,
                interviewQuestions: true,
                jdFileName: true,
                jdPreviewUrl: true,
                orgId: true,
                shortlistMode: true,
                location: true,
                aiName: true,
                cartesiaVoiceId: true,
                sarvamVoice: true,
                sarvamModel: true,
                googleModel: true,
                googleVoiceName: true,
                ttsProvider: true,
                organization: {
                    select: { 
                        status: true,
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
        } as any);

        if (!drive) {
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
        }

        if ((drive as any).organization && (drive as any).organization.status !== "ACTIVE") {
            return NextResponse.json({ error: "This organization is currently suspended. Access is restricted." }, { status: 403 });
        }

        const screeningThreshold = Number((drive as any).screeningThreshold ?? 60);
        const shortlistMode = (drive as any).shortlistMode || "automatic";

        return NextResponse.json({
            ...drive,
            orgId: (drive as any).orgId,
            screeningThreshold,
            shortlistMode,
            screeningCriteria: JSON.stringify({
                threshold: screeningThreshold,
                shortlistMode,
                criteria: {},
            }),
            applicants: (drive as any)._count?.applications || 0,
            aiScreening: {
                enabled: true,
                weights: {} // Schema doesn't have a weights field yet
            },
            extractedDetails: safeJsonParse((drive as any).extractedDetails, {})
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

        const rawBody = await request.text();
        if (!rawBody.trim()) {
            return NextResponse.json(
                { error: "Empty request body" },
                { status: 400 }
            );
        }

        let body: unknown;
        try {
            body = JSON.parse(rawBody);
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON" },
                { status: 400 }
            );
        }

        const result = updateDriveSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const data = result.data;
        const positions = data.positions !== undefined ? data.positions : undefined;
        const existingDrive = await prisma.drive.findUnique({
            where: { id: driveId },
            select: {
                ttsProvider: true,
                cartesiaVoiceId: true,
                sarvamVoice: true,
                googleModel: true,
                googleVoiceName: true,
            },
        });

        if (!existingDrive) {
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
        }

        const updateData: any = {};
        
        if (data.title !== undefined) updateData.title = data.title;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.role !== undefined) updateData.role = data.role;
        if (data.department !== undefined) updateData.department = data.department;
        if (data.employmentType !== undefined || data.type !== undefined) {
            updateData.type = data.employmentType || data.type;
        }
        if (data.workMode !== undefined) updateData.workMode = data.workMode;
        if (data.location !== undefined) updateData.location = data.location;
        if (positions !== undefined) updateData.positions = positions;
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
        
        if (data.screeningThreshold !== undefined || (data as any).screeningCriteria !== undefined || (data as any).shortlistMode !== undefined) {
            const rawCriteria = (data as any).screeningCriteria;
            const parsedCriteria = typeof rawCriteria === "string"
                ? safeJsonParse(rawCriteria, {})
                : (rawCriteria || {});
            const mergedCriteria = {
                ...(parsedCriteria && typeof parsedCriteria === "object" ? parsedCriteria : {}),
                ...(data.screeningThreshold !== undefined ? { threshold: data.screeningThreshold } : {}),
                ...((data as any).shortlistMode !== undefined ? { shortlistMode: (data as any).shortlistMode } : {}),
            };
            updateData.screeningCriteria = JSON.stringify(mergedCriteria);
        }

        // Add new interview fields to PATCH
        
        if (data.interviewLanguage !== undefined) updateData.interviewLanguage = data.interviewLanguage;
        if (data.interviewTime !== undefined) updateData.interviewTime = data.interviewTime;
        if (data.interviewAntiCheat !== undefined) updateData.proctoringLevel = data.interviewAntiCheat;
        if (data.interviewQuestions !== undefined) updateData.interviewQuestions = JSON.stringify(data.interviewQuestions);
        if (data.requirements !== undefined) updateData.requirements = data.requirements;
        if ((data as any).isPassportRequired !== undefined) updateData.isPassportRequired = (data as any).isPassportRequired;
        Object.assign(
            updateData,
            normalizeDriveAiConfig({
                current: existingDrive,
                next: {
                    ttsProvider: data.ttsProvider,
                    cartesiaVoiceId: data.cartesiaVoiceId,
                    sarvamVoice: data.sarvamVoice,
                    googleModel: data.googleModel,
                    googleVoiceName: data.googleVoiceName,
                },
            })
        );
        if (data.aiName !== undefined) updateData.aiName = data.aiName;
        

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json(
                { error: "No valid fields provided for update" },
                { status: 400 }
            );
        }


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

        // -- STORAGE CLEANUP: Purge JD & Resumes from R2 ----------
        try {
            // Fetch drive details before deletion to get the R2 links
            const driveWithApps = await prisma.drive.findUnique({
                where: { id: driveId },
                select: {
                    jdPreviewUrl: true,
                    applications: {
                        select: {
                            resumeUrl: true,
                            passportUrl: true,
                            interview: {
                                select: {
                                    interviewRecordingUrl: true,
                                    snapshots: true
                                }
                            }
                        }
                    }
                }
            });

            if (driveWithApps) {
                const urls: string[] = [];
                if (driveWithApps.jdPreviewUrl) urls.push(driveWithApps.jdPreviewUrl);
                for (const app of driveWithApps.applications) {
                    if (app.resumeUrl) urls.push(app.resumeUrl);
                    if (app.passportUrl) urls.push(app.passportUrl);
                    if (app.interview?.interviewRecordingUrl) urls.push(app.interview.interviewRecordingUrl);
                    if (app.interview?.snapshots?.length) urls.push(...app.interview.snapshots);
                }
                await deleteUrlTargets(urls);
            }
        } catch (storageErr) {
            console.error("[DELETE_SINGLE_DRIVE_STORAGE_ERROR]:", storageErr);
        }

        // -- VECTOR DB CLEANUP: Purge all Drive candidates from Pinecone ----------
        try {
            await deleteDriveEmbeddings(driveId);
        } catch (pineconeErr) {
            console.error("[DELETE_SINGLE_DRIVE_PINECONE_ERROR]:", pineconeErr);
        }

        await prisma.$transaction(async (tx) => {
            // 1. Get all application IDs for this drive
            const apps = await tx.application.findMany({
                where: { driveId },
                select: { id: true }
            });
            const appIds = apps.map((a: (typeof apps)[number]) => a.id);

            if (appIds.length > 0) {
                // 2. Delete all Interviews for these applications
                await tx.interview.deleteMany({
                    where: { applicationId: { in: appIds } }
                });

                // 3. Delete all Applications
                await tx.application.deleteMany({
                    where: { id: { in: appIds } }
                });
            }

            // 4. Finally delete the Drive
            await tx.drive.delete({
                where: { id: driveId },
            });
        });

        return NextResponse.json({ message: "Drive deleted successfully" });
    } catch (error) {
        console.error("Error deleting drive:", error);
        return NextResponse.json({ error: "Failed to delete drive" }, { status: 500 });
    }
}
