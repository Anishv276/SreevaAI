
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDriveSchema, bulkDeleteSchema, driveQuerySchema } from "@/lib/validation";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status");
        const search = searchParams.get("search") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "10");
        const skip = (page - 1) * limit;
        const orgId = searchParams.get("orgId");
        const now = new Date();

        let where: any = {};

        if (session) {
            // ── ADMIN ACCESS: Filter by Role & Org ───────────
            if ((session as any).role === "SUPER_ADMIN") {
                if (orgId) where.orgId = orgId;
            } else {
                where.orgId = (session as any).orgId;
            }

            if (status && status !== "all") {
                if (status === "active") where.status = "ACTIVE";
                if (status === "inactive") where.status = "CLOSED";
            }
        } else {
            // ── PUBLIC ACCESS: Only show Active & Non-Expired ──
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
            const isClosed = (deadline && deadline < now) || drive.status === "CLOSED";
            
            // Calculate real days left based on the specific deadline or fallback to 30 days
            const targetDate = deadline || new Date(new Date(drive.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
            const diffTime = Math.max(0, targetDate.getTime() - now.getTime());
            const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            return {
                ...drive,
                status: isClosed ? "CLOSED" : "ACTIVE",
                applicants: drive._count?.applications || 0,
                daysLeft,
                aiScreening: {
                    enabled: (drive as any).aiScreeningEnabled
                },
                registrationFields: drive.registrationFields ? JSON.parse(drive.registrationFields) : [],
                extractedDetails: drive.extractedDetails ? JSON.parse(drive.extractedDetails) : {}
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

import { sanitizeObject } from "@/lib/utils";

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const rawBody = await request.json();
        const body = sanitizeObject(rawBody);

        const result = createDriveSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const data = result.data;
        const deadline = data.deadline ? new Date(data.deadline) : null;

        let drive;
        try {
            drive = await prisma.drive.create({
                data: {
                    title: data.title,
                    description: data.description || "",
                    role: data.role || null,
                    department: data.department,
                    type: data.employmentType || data.type || "Full-time",
                    workMode: data.workMode || "Remote",
                    positions: data.positions || 1,
                    deadline: deadline,
                    aiScreeningEnabled: data.aiScreening?.enabled ?? true,
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
                    interviewEnabled: data.interviewEnabled ?? true,
                    interviewLanguage: data.interviewLanguage || "English",
                    interviewTime: data.interviewTime || 10,
                    proctoringLevel: data.interviewAntiCheat || "Medium",
                    aiFollowUpDepth: data.interviewFollowUp || 3,
                    interviewQuestions: JSON.stringify(data.interviewQuestions || []),
                    isPassportRequired: data.isPassportRequired || false,

                    orgId: (session as any).orgId,
                    creatorId: (session as any).userId,
                } as any,
            });
        } catch (error: any) {
            // If the error is due to unknown argument (client out of sync), retry without isPassportRequired
            if (error.message?.includes("Unknown argument `isPassportRequired`")) {
                console.warn("[PRISMA_SYNC_WARNING]: isPassportRequired unknown, retrying without it. Please run 'npx prisma generate'.");
                const { isPassportRequired: _, ...dataWithoutPassport } = {
                    title: data.title,
                    description: data.description || "",
                    role: data.role || null,
                    department: data.department,
                    type: data.employmentType || data.type || "Full-time",
                    workMode: data.workMode || "Remote",
                    positions: data.positions || 1,
                    deadline: deadline,
                    aiScreeningEnabled: data.aiScreening?.enabled ?? true,
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
                    interviewEnabled: data.interviewEnabled ?? true,
                    interviewLanguage: data.interviewLanguage || "English",
                    interviewTime: data.interviewTime || 10,
                    proctoringLevel: data.interviewAntiCheat || "Medium",
                    aiFollowUpDepth: data.interviewFollowUp || 3,
                    interviewQuestions: JSON.stringify(data.interviewQuestions || []),
                    orgId: (session as any).orgId,
                    creatorId: (session as any).userId,
                };
                
                drive = await prisma.drive.create({
                    data: dataWithoutPassport as any,
                });
            } else {
                throw error;
            }
        }

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

        // ── STORAGE CLEANUP: Purge JDs & Resumes from R2 ──────────
        try {
            const drivesWithApps = await prisma.drive.findMany({
                where: { id: { in: validIds } },
                select: {
                    jdPreviewUrl: true,
                    applications: {
                        select: { resumeUrl: true }
                    }
                }
            });

            const { deleteObject, getKeyFromUrl } = await import("@/lib/s3");
            const jdBucket = process.env.R2_JDS_BUCKET || "jds";
            const resumeBucket = process.env.R2_RESUMES_BUCKET || "resumes";

            for (const drive of drivesWithApps) {
                if (drive.jdPreviewUrl) {
                    const key = getKeyFromUrl(drive.jdPreviewUrl);
                    if (key) await deleteObject(jdBucket, key);
                }
                for (const app of drive.applications) {
                    if (app.resumeUrl) {
                        const key = getKeyFromUrl(app.resumeUrl);
                        if (key) await deleteObject(resumeBucket, key);
                    }
                }
            }
        } catch (storageErr) {
            console.error("[DELETE_DRIVE_STORAGE_ERROR]:", storageErr);
        }

        // ── CASCADE CLEANUP: Delete Interviews/Assessments first ──
        const applications = await prisma.application.findMany({
            where: { driveId: { in: validIds } },
            select: { id: true }
        });
        const appIds = applications.map(a => a.id);

        await prisma.$transaction(async (tx) => {
            if (appIds.length > 0) {
                // Delete Interviews
                await tx.interview.deleteMany({
                    where: { applicationId: { in: appIds } }
                });

                // Delete Assessments (defensive raw query as it might not be in schema)
                try {
                    await tx.$executeRawUnsafe(
                        `DELETE FROM "Assessment" WHERE "applicationId" = ANY($1)`,
                        appIds
                    );
                } catch (e) {
                    // Silently fail if table doesn't exist
                }

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
