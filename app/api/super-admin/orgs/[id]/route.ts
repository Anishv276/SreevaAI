import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { deleteOrgEmbeddings } from "@/lib/pinecone";
import { deleteUrlTargets } from "@/lib/delete-utils";
import { DEFAULT_ORG_PLAN, isOrgPlan, normalizeOrgPlan } from "@/lib/org-plans";
import { normalizeProctoringSignals } from "@/lib/proctoring-signals";
import { normalizeOrgAiConfig } from "@/lib/ai-provider-config";
import { syncOrgStatusWithInterviewQuota } from "@/lib/credits";
import { normalizeOrgLimitInput } from "@/lib/org-limits";

// GET /api/super-admin/orgs/[id] - fetch org for editing
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }

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
        const billingRows = await prisma.$queryRaw<Array<{
            interviewQuotaTotal: number | null;
            interviewQuotaUsed: number | null;
            creditsUsed: number | null;
        }>>(
            Prisma.sql`
                SELECT "interviewQuotaTotal", "interviewQuotaUsed", "creditsUsed"
                FROM "Organization"
                WHERE id = ${id}
                LIMIT 1
            `
        );

        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        return NextResponse.json({
            ...org,
            interviewQuotaTotal: billingRows[0]?.interviewQuotaTotal ?? 0,
            interviewQuotaUsed: billingRows[0]?.interviewQuotaUsed ?? 0,
            creditsUsed: billingRows[0]?.creditsUsed ?? 0,
        });
    } catch (error) {
        console.error("Error fetching org:", error);
        return NextResponse.json({ error: "Failed to fetch organization" }, { status: 500 });
    }
}

// PATCH /api/super-admin/orgs/[id] - update org (suspend, change plan, etc.)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const {
            name, plan, status, logoUrl, slug, location, maxActiveDrives,
            proctoringSignals,
            adminName, adminEmail,
            ttsProvider, cartesiaVoiceId, cartesiaModel, sarvamModel, sarvamVoice, googleModel, googleVoiceName,
            sttProvider, deepgramModel, sarvamSttModel,
            llmProvider, llmModel, llmTemperature,
            usageMetrics,
            interviewQuotaTotal,
            interviewQuotaTopUp,
        } = body;
        const parsedInterviewQuotaTopUp =
            interviewQuotaTopUp !== undefined ? Math.max(0, Math.round(Number(interviewQuotaTopUp) || 0)) : undefined;
        const parsedInterviewQuotaTotal =
            interviewQuotaTotal !== undefined ? Math.max(0, Math.round(Number(interviewQuotaTotal) || 0)) : undefined;
        const shouldApplyInterviewQuotaTopUp =
            parsedInterviewQuotaTopUp !== undefined && parsedInterviewQuotaTopUp > 0;
        const shouldUpdateInterviewQuotaTotal =
            parsedInterviewQuotaTotal !== undefined &&
            !isNaN(parsedInterviewQuotaTotal) &&
            parsedInterviewQuotaTotal >= 0;

        const existingOrg = await prisma.organization.findUnique({
            where: { id },
            select: {
                plan: true,
                ttsProvider: true,
                cartesiaModel: true,
                cartesiaVoiceId: true,
                sarvamModel: true,
                sarvamVoice: true,
                googleModel: true,
                googleVoiceName: true,
                sttProvider: true,
                deepgramModel: true,
                sarvamSttModel: true,
                llmProvider: true,
                llmModel: true,
                llmTemperature: true,
            },
        });

        if (!existingOrg) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        // -- INPUT VALIDATION --------------------------------
        if (plan && !isOrgPlan(plan)) {
            return NextResponse.json({ error: "Invalid organization plan" }, { status: 400 });
        }
        if (status && !["ACTIVE", "SUSPENDED", "PENDING", "DEACTIVATED", "CLOSED"].includes(status)) {
            return NextResponse.json({ error: "Invalid organization status" }, { status: 400 });
        }
        if (usageMetrics) {
            if (typeof usageMetrics !== "object" && typeof usageMetrics !== "string") {
                return NextResponse.json({ error: "usageMetrics must be an object or JSON string" }, { status: 400 });
            }
        }
        const normalizedPlan = plan !== undefined ? (normalizeOrgPlan(plan) || DEFAULT_ORG_PLAN) : null;

        // Build update - only write fields that were sent
        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (plan !== undefined) updateData.plan = normalizedPlan || plan;
        if (maxActiveDrives !== undefined && String(maxActiveDrives).trim() !== "") {
            updateData.maxActiveDrives = normalizeOrgLimitInput(maxActiveDrives);
        }
        if (proctoringSignals !== undefined) {
            updateData.proctoringSignals = normalizeProctoringSignals(proctoringSignals);
        }
        if (status !== undefined) updateData.status = status;
        if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
        if (slug !== undefined) updateData.slug = slug;
        if (location !== undefined) updateData.location = location;
        if (shouldUpdateInterviewQuotaTotal) {
            updateData.interviewQuotaTotal = parsedInterviewQuotaTotal;
        }

        Object.assign(
            updateData,
            normalizeOrgAiConfig({
                current: existingOrg,
                next: {
                    ttsProvider,
                    cartesiaVoiceId,
                    cartesiaModel,
                    sarvamModel,
                    sarvamVoice,
                    googleModel,
                    googleVoiceName,
                    sttProvider,
                    deepgramModel,
                    sarvamSttModel,
                    llmProvider,
                    llmModel,
                    llmTemperature,
                },
            })
        );

        // Usage metrics — internal API cost tracking, untouched by billing
        if (usageMetrics !== undefined) {
            if (typeof usageMetrics === "string") {
                const trimmed = usageMetrics.trim();
                if (!trimmed) {
                    updateData.usageMetrics = {};
                } else {
                    try {
                        updateData.usageMetrics = JSON.parse(trimmed);
                    } catch {
                        return NextResponse.json({ error: "usageMetrics must be valid JSON" }, { status: 400 });
                    }
                }
            } else {
                updateData.usageMetrics = usageMetrics ?? {};
            }
        }

        // -- EMAIL CONFLICT CHECK ----------------------------
        if (adminEmail) {
            const normalizedEmail = adminEmail.toLowerCase().trim();
            const existingUser = await prisma.user.findUnique({
                where: { email: normalizedEmail }
            });

            if (existingUser) {
                // Find the actual primary admin for this org
                const currentAdmin = await prisma.user.findFirst({
                    where: { orgId: id, role: "ORG_ADMIN" },
                    orderBy: { createdAt: "asc" }
                });

                // Conflict: Email belongs to SOMEONE ELSE
                if (currentAdmin && existingUser.id !== currentAdmin.id) {
                    return NextResponse.json({ 
                        error: `The email "${normalizedEmail}" is already registered with another account. Please use a different one.` 
                    }, { status: 400 });
                }
            }
        }

        // When org switches away from GOOGLE, cascade-clear Google fields on all drives
        // so COALESCE(drive.ttsProvider, org.ttsProvider) doesn't resurrect the Google path.
        const newTtsProvider = String(updateData.ttsProvider || "").toUpperCase();
        const wasGoogle = String(existingOrg.ttsProvider || "").toUpperCase() === "GOOGLE";
        const isNowNonGoogle = newTtsProvider && newTtsProvider !== "GOOGLE";
        const shouldClearDriveGoogleFields = wasGoogle && isNowNonGoogle;

        // -- TRANSACTION: Update Org & Admin ------------------
        const updated = await prisma.$transaction(async (tx) => {
            // 1. Update Org
            const org = await tx.organization.update({
                where: { id },
                data: updateData,
            });

            // 2. Clear stale Google overrides on all drives under this org
            if (shouldClearDriveGoogleFields) {
                await tx.drive.updateMany({
                    where: { orgId: id, ttsProvider: "GOOGLE" },
                    data: {
                        ttsProvider: null,
                        googleModel: null,
                        googleVoiceName: null,
                    },
                });
            }

            if (shouldApplyInterviewQuotaTopUp) {
                await tx.$executeRaw(
                    Prisma.sql`
                        UPDATE "Organization"
                        SET "interviewQuotaTotal" = COALESCE("interviewQuotaTotal", 0) + ${parsedInterviewQuotaTopUp}
                        WHERE id = ${id}
                    `
                );
            }

            // 2. Update Primary Admin if name/email provided
            if (adminName !== undefined || adminEmail !== undefined) {
                // Find the first ORG_ADMIN
                const admin = await tx.user.findFirst({
                    where: { orgId: id, role: "ORG_ADMIN" },
                    orderBy: { createdAt: "asc" }
                });

                if (admin) {
                    const adminUpdate: any = {};
                    if (adminName) adminUpdate.name = adminName;
                    if (adminEmail) adminUpdate.email = adminEmail.toLowerCase().trim();

                    await tx.user.update({
                        where: { id: admin.id },
                        data: adminUpdate
                    });
                }
            }

            const billingRows = await tx.$queryRaw<Array<{
                interviewQuotaTotal: number | null;
                interviewQuotaUsed: number | null;
                creditsUsed: number | null;
            }>>(
                Prisma.sql`
                    SELECT "interviewQuotaTotal", "interviewQuotaUsed", "creditsUsed"
                    FROM "Organization"
                    WHERE id = ${id}
                    LIMIT 1
                `
            );

            return {
                ...org,
                interviewQuotaTotal: billingRows[0]?.interviewQuotaTotal ?? 0,
                interviewQuotaUsed: billingRows[0]?.interviewQuotaUsed ?? 0,
                creditsUsed: billingRows[0]?.creditsUsed ?? 0,
            };
        });

        if (shouldUpdateInterviewQuotaTotal || shouldApplyInterviewQuotaTopUp) {
            const syncedStatus = await syncOrgStatusWithInterviewQuota(id);
            if (syncedStatus) {
                updated.status = syncedStatus;
            }
        }

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating org:", error);
        return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
    }
}

// DELETE /api/super-admin/orgs/[id] - remove org and all its data
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }

        const { id } = await params;

        // -- STEP 1: DISCOVERY (Find all associated assets) ------------------

        // 1. Get Organization for Logo
        const org = await prisma.organization.findUnique({
            where: { id },
            select: { logoUrl: true }
        });

        // 2. Get all drives to find associated applications and interviews
        const drives = await prisma.drive.findMany({ 
            where: { orgId: id }, 
            select: { id: true, jdPreviewUrl: true } 
        });
        const driveIds = drives.map((d: (typeof drives)[number]) => d.id);

        // 3. Get all applications and their files
        const applications = await prisma.application.findMany({
            where: { driveId: { in: driveIds } },
            select: { id: true, resumeUrl: true }
        });
        const appIds = applications.map((app: (typeof applications)[number]) => app.id);

        // 4. Get all interviews and recordings
        const interviews = await prisma.interview.findMany({
            where: { applicationId: { in: appIds } },
            select: { interviewRecordingUrl: true, snapshots: true }
        });

        // -- STEP 2: EXTERNAL ASSET CLEANUP (R2 & PINECONE) -------------------

        const fileUrlsToDelete: string[] = [];
        
        // Collect all file URLs
        if (org?.logoUrl) fileUrlsToDelete.push(org.logoUrl);
        drives.forEach(d => { if (d.jdPreviewUrl) fileUrlsToDelete.push(d.jdPreviewUrl); });
        applications.forEach(app => {
            if (app.resumeUrl) fileUrlsToDelete.push(app.resumeUrl);
        });
        interviews.forEach(intv => {
            if (intv.interviewRecordingUrl) fileUrlsToDelete.push(intv.interviewRecordingUrl);
            if (intv.snapshots && Array.isArray(intv.snapshots)) {
                fileUrlsToDelete.push(...intv.snapshots);
            }
        });

        await deleteUrlTargets(fileUrlsToDelete);

        // Trigger Pinecone Cleanup
        try {
            await deleteOrgEmbeddings(id);
        } catch (pineconeError) {
            console.error("Failed to clear Pinecone embeddings for org:", id, pineconeError);
        }

        // -- STEP 3: DATABASE CLEANUP (Cascading) ---------------------------
        
        await prisma.$transaction(async (tx) => {
            // 1. Delete Support Tickets
            await tx.supportTicket.deleteMany({
                where: {
                    OR: [
                        { interview: { application: { drive: { orgId: id } } } },
                        { applicationId: { in: appIds } }
                    ]
                }
            });

            // 2. Delete Interviews
            await tx.interview.deleteMany({
                where: { application: { drive: { orgId: id } } }
            });

            // 3. Delete Applications
            await tx.application.deleteMany({
                where: { drive: { orgId: id } }
            });

            // 4. Delete Resume Candidates
            await tx.resumeCandidate.deleteMany({
                where: { drive: { orgId: id } }
            });

            // 5. Delete Resume Batches
            await tx.resumeBatch.deleteMany({
                where: { drive: { orgId: id } }
            });

            // 6. Delete Drives
            await tx.drive.deleteMany({
                where: { orgId: id }
            });

            // 7. Delete Users
            await tx.user.deleteMany({
                where: { orgId: id }
            });

            // 8. Delete Organization
            await tx.organization.delete({
                where: { id }
            });
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting org:", error);
        return NextResponse.json({ error: "Failed to delete organization" }, { status: 500 });
    }
}
