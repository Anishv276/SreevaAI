import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDriveSchema, bulkDeleteSchema } from "@/lib/validation";
import { getSession } from "@/lib/auth";
import { sanitizeObject } from "@/lib/utils";
import { generateId } from "@/lib/ids";
import { deleteUrlTargets } from "@/lib/delete-utils";
import { getRecordingUrl } from "@/lib/recording-state";
import { getOrgBillingStatus } from "@/lib/credits";
import { isDriveCreationLocked } from "@/lib/drive-limits";
import { normalizeDriveAiConfig } from "@/lib/ai-provider-config";
import { getInterviewQuotaSupportMessage, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { parseOrgLimitValue } from "@/lib/org-limits";
import { parseDriveScreeningSettings, sanitizeScreeningCriteria } from "@/lib/screening-criteria";
function normalizeDeadlineDate(deadline?: string | null) {
    if (!deadline) return null;
    const parsed = new Date(`${deadline}T23:59:59.999`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "10");
        const skip = (page - 1) * limit;
        const orgId = searchParams.get("orgId");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const where: any = {};
        if (startDate) {
            where.createdAt = {
                ...where.createdAt,
                gte: new Date(startDate)
            };
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            where.createdAt = {
                ...where.createdAt,
                lte: end
            };
        }
        // -- ADMIN ACCESS: Filter by Role & Org -----------
        if ((session as any).role === "SUPER_ADMIN") {
            if (orgId) where.orgId = orgId;
        } else {
            where.orgId = (session as any).orgId;
        }
        // Search filters
        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { role: { contains: search, mode: "insensitive" } }
            ];
        }
        const [drives, total] = await Promise.all([
            (prisma.drive as any).findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                select: {
                    id: true,
                    title: true,
                    role: true,
                    screeningThreshold: true,
                    creatorId: true,
                    createdAt: true,
                    updatedAt: true,
                    screeningCriteria: true,
                    interviewLanguage: true,
                    interviewQuestions: true,
                    jdFileName: true,
                    jdPreviewUrl: true,
                    orgId: true,
                    deadline: true,
                    aiName: true,
                    voiceId: true,
                    _count: {
                        select: { applications: { where: { isDeleted: false } } },
                    },
                },
            }),
            prisma.drive.count({ where })
        ]);
        const formattedDrives = drives.map((drive: any) => {
            const screeningThreshold = Number(drive.screeningThreshold ?? 60);
            const parsedScreening = parseDriveScreeningSettings(
                drive.screeningCriteria,
                screeningThreshold,
            );
            return {
                ...drive,
                applicants: drive._count?.applications || 0,
                screeningThreshold: parsedScreening.threshold,
                screeningCriteria: JSON.stringify({
                    threshold: parsedScreening.threshold,
                    criteria: parsedScreening.criteria,
                }),
                aiScreening: {
                    enabled: (drive as any).aiScreeningEnabled
                },
                interviewQuestions: drive.interviewQuestions ? JSON.parse(drive.interviewQuestions) : []
            };
        });
        return NextResponse.json({
            drives: formattedDrives,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        }, {
            headers: {
                'Cache-Control': 'private, max-age=45',
            }
        });
    } catch (error) {
        console.error("Error fetching drives:", error);
        return NextResponse.json({ error: "Failed to fetch drives" }, { status: 500 });
    }
}
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        if (session.orgId) {
            const org = await prisma.organization.findUnique({
                where: { id: session.orgId },
                select: { status: true, maxActiveDrives: true }
            });
            if (isOrgRestrictedStatus(org?.status)) {
                return NextResponse.json({ error: "Drive creation is blocked because your organization is restricted." }, { status: 403 });
            }
            const billingStatus = await getOrgBillingStatus(session.orgId);
            if (billingStatus.interviewQuotaTotal > 0 && !billingStatus.hasSufficientInterviews) {
                return NextResponse.json(
                    {
                        error: getInterviewQuotaSupportMessage("interviews"),
                        code: "NO_INTERVIEWS",
                    },
                    { status: 402 }
                );
            }
            const maxActiveDrives = parseOrgLimitValue(org?.maxActiveDrives);
            if (maxActiveDrives !== null) {
                const activeDriveCount = await prisma.drive.count({
                    where: { orgId: session.orgId }
                });
                if (isDriveCreationLocked(maxActiveDrives, activeDriveCount)) {
                    return NextResponse.json(
                        {
                            error: "Drive limit reached. Upgrade your plan or increase the limit to create another drive.",
                            code: "DRIVE_LIMIT_REACHED",
                            activeDriveCount,
                            maxActiveDrives,
                        },
                        { status: 409 }
                    );
                }
            }
        }
        const rawBody = await request.json();
        const body = sanitizeObject(rawBody);
        const result = createDriveSchema.safeParse(body);
        if (!result.success) {
            console.error("[POST /api/drives] Validation failed:", JSON.stringify(result.error.flatten().fieldErrors, null, 2));
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        const data = result.data;
        const aiConfig = normalizeDriveAiConfig({
            next: { voiceId: data.voiceId },
        });
        const screeningCriteria = (() => {
            const raw = data.screeningCriteria;
            if (!raw) return {};
            if (typeof raw === "string") {
                try {
                    return JSON.parse(raw);
                } catch {
                    return {};
                }
            }
            return raw;
        })();
        const normalizedScreeningCriteria = sanitizeScreeningCriteria(screeningCriteria);
        const mergedScreeningCriteria = {
            ...normalizedScreeningCriteria,
            ...(data.screeningThreshold !== undefined ? { threshold: data.screeningThreshold } : {}),
        };
        const driveId = generateId("drv", data.title);
        const drive = await (prisma.drive as any).create({
            data: {
                id: driveId,
                title: data.title,
                role: data.role || null,
                extractedDetails: data.extractedDetails || null,
                jdFileName: data.jdFileName || null,
                jdPreviewUrl: data.jdPreviewUrl?.startsWith("blob:") ? null : (data.jdPreviewUrl || null),
                screeningCriteria: JSON.stringify(mergedScreeningCriteria),
                screeningThreshold: data.screeningThreshold ?? 60,
                deadline: normalizeDeadlineDate(data.deadline as string | null | undefined),
                // Interview configuration
                interviewLanguage: data.interviewLanguage || "English",
                interviewQuestions: data.interviewQuestions ? JSON.stringify(data.interviewQuestions) : "[]",
                aiName: data.aiName || "Ishitha",
                orgId: (session as any).orgId,
                creatorId: (session as any).userId,
                ...aiConfig,
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
        // -- SECURITY: Ensure IDs belong to the Org -----------
        const belongsToOrg = await prisma.drive.findMany({
            where: { id: { in: ids }, orgId: session.orgId },
            select: { id: true },
        });
        const validIds = belongsToOrg.map((d: (typeof belongsToOrg)[number]) => d.id);
        if (validIds.length === 0) return NextResponse.json({ message: "No matching drives found" });
        // -- SOFT DELETE: DATABASE CLEANUP (Cascading) ---------------------------
        await prisma.$transaction(async (tx) => {
            const timestamp = Date.now().toString();
            // 1. Soft Delete Drives
            await tx.drive.updateMany({
                where: { id: { in: validIds } },
                data: { isDeleted: true }
            });
            // 2. Soft Delete Resume Batches
            await tx.resumeBatch.updateMany({
                where: { driveId: { in: validIds } },
                data: { isDeleted: true }
            });
            // 3. Soft Delete Applications
            await tx.application.updateMany({
                where: { driveId: { in: validIds } },
                data: { isDeleted: true }
            });
            // 5. Soft Delete Interviews (rename unique keys via Raw SQL)
            if (validIds.length > 0) {
                const placeholders = validIds.map(id => `'${id}'`).join(',');
                await tx.$executeRawUnsafe(`
                    UPDATE "Interview" 
                    SET "isDeleted" = true, 
                        "applicationId" = 'del_' || ${timestamp} || '_' || "applicationId", 
                        "accessToken" = 'del_' || ${timestamp} || '_' || "accessToken"
                    WHERE "applicationId" IN (SELECT "id" FROM "Application" WHERE "driveId" IN (${placeholders}))
                `);
                // 6. Soft Delete Support Tickets
                await tx.$executeRawUnsafe(`
                    UPDATE "SupportTicket" SET "status" = 'DELETED'
                    WHERE "interviewId" IN (
                        SELECT "id" FROM "Interview" WHERE "applicationId" IN (
                            SELECT "id" FROM "Application" WHERE "driveId" IN (${placeholders})
                        )
                    )
                `);
            }
        });
        return NextResponse.json({ message: `${validIds.length} drives soft-deleted successfully` });
    } catch (error) {
        console.error("Error bulk deleting drives:", error);
        return NextResponse.json({ error: "Failed to delete drives" }, { status: 500 });
    }
}
