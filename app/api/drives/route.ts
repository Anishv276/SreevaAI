import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { createDriveSchema, bulkDeleteSchema, driveQuerySchema } from "@/lib/validation";
import { getSession } from "@/lib/auth";
import { sanitizeObject } from "@/lib/utils";
import { generateId } from "@/lib/ids";
import { deleteUrlTargets } from "@/lib/delete-utils";
import { deleteDriveEmbeddings } from "@/lib/pinecone";
import { getOrgCreditStatus } from "@/lib/credits";
import { isDriveCreationLocked } from "@/lib/drive-limits";
import { normalizeDriveAiConfig } from "@/lib/ai-provider-config";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status");
        const type = searchParams.get("type");
        const search = searchParams.get("search") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "10");
        const skip = (page - 1) * limit;
        const orgId = searchParams.get("orgId");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const now = new Date();

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

        if (session) {
            // -- ADMIN ACCESS: Filter by Role & Org -----------
            if ((session as any).role === "SUPER_ADMIN") {
                if (orgId) where.orgId = orgId;
            } else {
                where.orgId = (session as any).orgId;
            }

            if (status && status !== "all") {
                if (status === "ACTIVE") {
                    where.status = "ACTIVE";
                    where.AND = [
                        ...(where.AND || []),
                        { OR: [{ deadline: null }, { deadline: { gte: now } }] }
                    ];
                } else if (status === "CLOSED") {
                    where.status = "CLOSED";
                } else if (status === "EXPIRED") {
                    where.status = "ACTIVE";
                    where.deadline = { lt: now };
                }
            }

            if (type && type !== "all") {
                where.type = { equals: type, mode: "insensitive" };
            }
        } else {
            // -- PUBLIC ACCESS: Only show Active & Non-Expired --
            where.status = "ACTIVE";
            where.AND = [
                {
                    OR: [
                        { deadline: null },
                        { deadline: { gte: now } }
                    ]
                }
            ];
            if (orgId) where.orgId = orgId;
        }

        // Search filters
        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { department: { contains: search, mode: "insensitive" } },
                { role: { contains: search, mode: "insensitive" } }
            ];
        }

        const [drives, total] = await Promise.all([
            prisma.drive.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                include: {
                    _count: {
                        select: { applications: true },
                    },
                },
            }),
            prisma.drive.count({ where })
        ]);

        const formattedDrives = drives.map((drive: any) => {
            const now = new Date();
            const deadline = drive.deadline ? new Date(drive.deadline) : null;
            const isExpired = drive.status !== "CLOSED" && deadline && deadline < now;

            // Calculate real days left based on the specific deadline or fallback to 30 days
            const targetDate = deadline || new Date(new Date(drive.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
            const diffTime = Math.max(0, targetDate.getTime() - now.getTime());
            const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            const effectiveStatus = drive.status === "CLOSED" ? "CLOSED" : isExpired ? "EXPIRED" : "ACTIVE";

            return {
                ...drive,
                status: effectiveStatus,
                applicants: drive._count?.applications || 0,
                daysLeft,
                aiScreening: {
                    enabled: (drive as any).aiScreeningEnabled
                },
                registrationFields: drive.registrationFields ? JSON.parse(drive.registrationFields) : [],
                extractedDetails: drive.extractedDetails ? JSON.parse(drive.extractedDetails) : {},
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
            if (org?.status === "SUSPENDED" || org?.status === "CLOSED") {
                return NextResponse.json({ error: "Drive creation is blocked because your organization is restricted." }, { status: 403 });
            }

            const creditStatus = await getOrgCreditStatus(session.orgId);
            if (creditStatus.creditsTotal > 0 && !creditStatus.hasSufficientCredits) {
                return NextResponse.json({ error: "Insufficient credits. Recharge to create new drives.", code: "NO_CREDITS" }, { status: 402 });
            }

            const maxActiveDrives = Number(org?.maxActiveDrives || 0);
            if (maxActiveDrives > 0) {
                const activeDriveCount = await prisma.drive.count({
                    where: {
                        orgId: session.orgId,
                        status: "ACTIVE",
                        OR: [
                            { deadline: null },
                            { deadline: { gte: new Date() } }
                        ],
                    }
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
        const deadline = data.deadline ? new Date(data.deadline) : null;
        const aiConfig = normalizeDriveAiConfig({
            next: {
                ttsProvider: data.ttsProvider,
                cartesiaVoiceId: data.cartesiaVoiceId,
                sarvamVoice: data.sarvamVoice,
                googleModel: data.googleModel,
                googleVoiceName: data.googleVoiceName,
            },
        });

        const slug = crypto.randomUUID();
        const driveId = generateId("drv", data.title);

        const drive = await prisma.drive.create({
            data: {
                id: driveId,
                slug,
                title: data.title,
                description: data.description || "",
                role: data.role || null,
                department: data.department,
                type: data.employmentType || data.type || "Full-time",
                workMode: data.workMode || null,
                location: data.location || null,
                positions: data.positions || 1,
                deadline: deadline,
                salary: data.salary || null,
                experience: data.experience || null,
                skills: data.skills || null,
                responsibilities: data.responsibilities || null,
                requirements: data.requirements || null,
                extractedDetails: JSON.stringify(data.extractedDetails || {}),
                jdFileName: data.jdFileName || null,
                jdPreviewUrl: data.jdPreviewUrl?.startsWith("blob:") ? null : (data.jdPreviewUrl || null),
                registrationFields: JSON.stringify(data.registrationFields || []),
                screeningThreshold: data.screeningThreshold || 0,

                // Interview configuration
                interviewLanguage: data.interviewLanguage || "English",
                interviewTime: data.interviewTime ?? null,
                proctoringLevel: data.interviewAntiCheat || "Medium",
                interviewQuestions: data.interviewQuestions ? JSON.stringify(data.interviewQuestions) : "[]",
                
                aiName: data.aiName || "Ishitha",
                
                isPassportRequired: data.isPassportRequired || false,
                shortlistMode: data.shortlistMode || "automatic",

                orgId: (session as any).orgId,
                creatorId: (session as any).userId,
                ...aiConfig,
            },
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

        // -- STORAGE CLEANUP: Purge JDs & Resumes from R2 ----------
        try {
            const drivesWithApps = await prisma.drive.findMany({
                where: { id: { in: validIds } },
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

            const urls: string[] = [];
            for (const drive of drivesWithApps) {
                if (drive.jdPreviewUrl) urls.push(drive.jdPreviewUrl);
                for (const app of drive.applications) {
                    if (app.resumeUrl) urls.push(app.resumeUrl);
                    if (app.passportUrl) urls.push(app.passportUrl);
                    if (app.interview?.interviewRecordingUrl) urls.push(app.interview.interviewRecordingUrl);
                    if (app.interview?.snapshots?.length) urls.push(...app.interview.snapshots);
                }
            }
            await deleteUrlTargets(urls);
        } catch (storageErr) {
            console.error("[DELETE_DRIVE_STORAGE_ERROR]:", storageErr);
        }

        // -- CASCADE CLEANUP: Delete Interviews first --
        const applications = await prisma.application.findMany({
            where: { driveId: { in: validIds } },
            select: { id: true }
        });
        const appIds = applications.map((a: (typeof applications)[number]) => a.id);

        try {
            for (const driveId of validIds) {
                await deleteDriveEmbeddings(driveId);
            }
        } catch (pineconeErr) {
            console.error("[BULK_DELETE_DRIVE_PINECONE_ERROR]:", pineconeErr);
        }

        await prisma.$transaction(async (tx) => {
            if (appIds.length > 0) {
                // Delete Interviews
                await tx.interview.deleteMany({
                    where: { applicationId: { in: appIds } }
                });

                // Delete Applications
                await tx.application.deleteMany({
                    where: { id: { in: appIds } }
                });
            }

            // Finally delete the Drives
            await tx.drive.deleteMany({
                where: { id: { in: validIds } }
            });
        });

        return NextResponse.json({ message: `${validIds.length} drives deleted successfully` });
    } catch (error) {
        console.error("Error bulk deleting drives:", error);
        return NextResponse.json({ error: "Failed to delete drives" }, { status: 500 });
    }
}
