import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateDriveSchema } from "@/lib/validation";
import { deleteUrlTargets } from "@/lib/delete-utils";
import { getRecordingUrl } from "@/lib/recording-state";
import { normalizeDriveAiConfig } from "@/lib/ai-provider-config";
import { safeJsonParse } from "@/lib/utils";
import { getSession } from "@/lib/auth";
import { parseDriveScreeningSettings, sanitizeScreeningCriteria } from "@/lib/screening-criteria";
import { isOrgRestrictedStatus } from "@/lib/interview-quota";
function normalizeDeadlineDate(deadline?: string | null) {
    if (!deadline) return null;
    const parsed = new Date(`${deadline}T23:59:59.999`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}
export const dynamic = "force-dynamic";
/**
 * GET handler to fetch the metadata for a specific recruitment drive.
 *
 * @param {Request} request - The standard incoming API request wrapper.
 * @param {Object} context - URL route mapping parameters.
 * @param {Promise<{id: string}>} context.params - Async parameter identifier tuple.
 * @returns {Promise<NextResponse>} Complete drive configuration or 404 error state.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const drive = await (prisma.drive as any).findFirst({
            where: {
                id
            },
            select: {
                id: true,
                title: true,
                role: true,
                screeningThreshold: true,
                screeningCriteria: true,
                extractedDetails: true,
                creatorId: true,
                createdAt: true,
                updatedAt: true,
                deadline: true,
                interviewLanguage: true,
                interviewQuestions: true,
                jdFileName: true,
                jdPreviewUrl: true,
                orgId: true,
                aiName: true,
                voiceId: true,
                organization: {
                    select: {
                        status: true,
                        name: true,
                        logoUrl: true,
                        website: true,
                    },
                },
                _count: {
                    select: { applications: true },
                },
            },
        } as any);
        if (!drive) {
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
        }
        if ((drive as any).organization && isOrgRestrictedStatus((drive as any).organization.status)) {
            return NextResponse.json({ error: "This organization is currently suspended. Access is restricted." }, { status: 403 });
        }
        const screeningThreshold = Number((drive as any).screeningThreshold ?? 60);
        const parsedCriteria = parseDriveScreeningSettings(
            (drive as any).screeningCriteria,
            screeningThreshold,
        );
        const screeningCriteria = JSON.stringify({
            threshold: parsedCriteria.threshold,
            criteria: parsedCriteria.criteria,
        });
        const interviewQuestions = (() => {
            try {
                const raw = (drive as any).interviewQuestions;
                return raw ? JSON.parse(raw) : [];
            } catch {
                return [];
            }
        })();
        return NextResponse.json({
            ...drive,
            orgId: (drive as any).orgId,
            screeningThreshold,
            screeningCriteria,
            interviewQuestions,
            applicants: (drive as any)._count?.applications || 0,
            aiScreening: {
                enabled: true,
                weights: {} // Schema doesn't have a weights field yet
            },
        }, {
            headers: {
                'Cache-Control': 'private, max-age=60',
            }
        });
    } catch (error: any) {
        console.error("[GET_DRIVE_ERROR]:", error);
        return NextResponse.json({
            error: "Failed to fetch drive",
            details: error.message
        }, { status: 500 });
    }
}
/**
 * PATCH handler to update metadata details for a specific recruitment drive.
 *
 * @param {Request} request - The standard incoming API request wrapper.
 * @param {Object} context - URL route mapping parameters.
 * @param {Promise<{id: string}>} context.params - Async parameter identifier tuple.
 * @returns {Promise<NextResponse>} Success confirmation payload.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    let driveId: string = "";
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
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
        const existingDrive = await (prisma.drive as any).findUnique({
            where: { id: driveId },
            select: {
                orgId: true,
                extractedDetails: true,
                voiceId: true,
            },
        });
        if (!existingDrive) {
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
        }
        const isSuperAdmin = session.role === "SUPER_ADMIN";
        if (!isSuperAdmin && existingDrive.orgId !== session.orgId) {
            return NextResponse.json({ error: "Access Denied: Ownership required to modify drive" }, { status: 403 });
        }
        const updateData: any = {};
        if (data.title !== undefined) updateData.title = data.title;
        if (data.role !== undefined) updateData.role = data.role;
        if (data.deadline !== undefined) updateData.deadline = normalizeDeadlineDate(data.deadline as string | null | undefined);
        if (data.jdFileName !== undefined) updateData.jdFileName = data.jdFileName;
        if (data.jdPreviewUrl !== undefined) {
            const persistedJdUrl = data.jdPreviewUrl?.startsWith("blob:")
                ? (existingDrive as any).jdPreviewUrl || null
                : (data.jdPreviewUrl || null);
            if (persistedJdUrl !== null) {
                updateData.jdPreviewUrl = persistedJdUrl;
            }
        }
        // When extractedDetails changes, re-derive all text fields from it
        if (data.extractedDetails !== undefined) {
            const extractedStr = typeof data.extractedDetails === "string"
                ? data.extractedDetails
                : JSON.stringify(data.extractedDetails);
            updateData.extractedDetails = extractedStr;
            try {
                const parsed = JSON.parse(extractedStr);
                // derived fields removed — extractedDetails is source of truth
            } catch { /* keep existing values if parse fails */ }
        }
        if (data.screeningThreshold !== undefined || (data as any).screeningCriteria !== undefined) {
            if (data.screeningThreshold !== undefined) updateData.screeningThreshold = data.screeningThreshold;
            const rawCriteria = (data as any).screeningCriteria;
            const parsedCriteria = typeof rawCriteria === "string"
                ? safeJsonParse(rawCriteria, {})
                : (rawCriteria || {});
            const normalizedCriteria = sanitizeScreeningCriteria(parsedCriteria);
            const mergedCriteria = {
                ...normalizedCriteria,
                ...(data.screeningThreshold !== undefined ? { threshold: data.screeningThreshold } : {}),
            };
            updateData.screeningCriteria = JSON.stringify(mergedCriteria);
        }
        if (data.interviewLanguage !== undefined) updateData.interviewLanguage = data.interviewLanguage;
        if (data.interviewQuestions !== undefined) updateData.interviewQuestions = JSON.stringify(data.interviewQuestions);
        Object.assign(
            updateData,
            normalizeDriveAiConfig({
                current: existingDrive,
                next: { voiceId: data.voiceId },
            })
        );
        if (data.aiName !== undefined) updateData.aiName = data.aiName;
        if (Object.keys(updateData).length === 0) {
            return NextResponse.json(
                { error: "No valid fields provided for update" },
                { status: 400 }
            );
        }
        const updated = await (prisma.drive as any).update({
            where: { id: driveId },
            data: updateData as any,
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
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { id } = await params;
        const driveId = id;
        const drive = await prisma.drive.findUnique({
            where: { id: driveId },
            select: { orgId: true }
        });
        if (!drive) {
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
        }
        const isSuperAdmin = session.role === "SUPER_ADMIN";
        if (!isSuperAdmin && drive.orgId !== session.orgId) {
            return NextResponse.json({ error: "Access Denied: Ownership required to remove drive" }, { status: 403 });
        }
        // -- SOFT DELETE: DATABASE CLEANUP (Cascading) ---------------------------
        // We use raw SQL to handle appending timestamps to unique columns safely.
        await prisma.$transaction(async (tx) => {
            const timestamp = Date.now().toString();
            // 1. Soft Delete Drive
            await tx.$executeRaw`UPDATE "Drive" SET "isDeleted" = true WHERE "id" = ${driveId}`;
            // 2. Soft Delete Resume Batches
            await tx.$executeRaw`UPDATE "ResumeBatch" SET "isDeleted" = true WHERE "driveId" = ${driveId}`;
            // 3. Soft Delete Resume Candidates
            await tx.$executeRaw`UPDATE "ResumeCandidate" SET "isDeleted" = true WHERE "driveId" = ${driveId}`;
            // 4. Soft Delete Applications
            await tx.$executeRaw`UPDATE "Application" SET "isDeleted" = true WHERE "driveId" = ${driveId}`;
            // 5. Soft Delete Interviews (rename applicationId and accessToken)
            await tx.$executeRaw`
                UPDATE "Interview" 
                SET "isDeleted" = true, 
                    "applicationId" = 'del_' || ${timestamp} || '_' || "applicationId", 
                    "accessToken" = 'del_' || ${timestamp} || '_' || "accessToken"
                WHERE "applicationId" IN (SELECT "id" FROM "Application" WHERE "driveId" = ${driveId})
            `;
            // 6. Soft Delete Support Tickets
            await tx.$executeRaw`
                UPDATE "SupportTicket" SET "status" = 'DELETED'
                WHERE "interviewId" IN (
                    SELECT "id" FROM "Interview" WHERE "applicationId" IN (
                        SELECT "id" FROM "Application" WHERE "driveId" = ${driveId}
                    )
                )
            `;
        });
        return NextResponse.json({ message: "Drive soft-deleted successfully" });
    } catch (error) {
        console.error("Error deleting drive:", error);
        return NextResponse.json({ error: "Failed to delete drive" }, { status: 500 });
    }
}
