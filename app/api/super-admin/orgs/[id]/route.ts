import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession, invalidateUserSessions } from "@/lib/auth";
import { deleteUrlTargets } from "@/lib/delete-utils";
import { getRecordingUrl } from "@/lib/recording-state";
import { DEFAULT_ORG_PLAN, isOrgPlan, normalizeOrgPlan } from "@/lib/org-plans";
import { normalizeProctoringSignals } from "@/lib/proctoring-signals";
import { normalizeOrgAiConfig } from "@/lib/ai-provider-config";
import { ORG_STATUS_CONTROL_MANUAL, ORG_STATUS_CONTROL_QUOTA, getEffectiveOrgStatus, normalizeOrgStatusControl, syncOrgStatusWithInterviewQuota } from "@/lib/credits";
import { normalizeOrgLimitInput } from "@/lib/org-limits";
import { normalizeEmail } from "@/lib/email";
import { validatePasswordStrength } from "@/lib/validation";
import { normalizeRecordingRetentionDays } from "@/lib/recording-retention";
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
        const effectiveStatus = await getEffectiveOrgStatus(id);
        return NextResponse.json({
            ...org,
            status: String(effectiveStatus || org.status || "ACTIVE").toUpperCase(),
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
        const rawBody = await request.text();
        const body = rawBody.trim() ? JSON.parse(rawBody) : {};
        const {
            name, plan, status, slug, maxActiveDrives,
            recordingEnabled, recordingRetentionDays,
            proctoringSignals,
            adminEmail,
            adminPassword,
            voiceId, allowedVoices,
            usageMetrics,
            interviewQuotaTotal,
            interviewQuotaTopUp,
            maxConcurrentSlots,
        } = body;
        const parsedInterviewQuotaTopUp =
            interviewQuotaTopUp !== undefined ? Math.max(0, Math.round(Number(interviewQuotaTopUp) || 0)) : undefined;
        const parsedInterviewQuotaTotal =
            interviewQuotaTotal !== undefined ? Math.max(0, Math.round(Number(interviewQuotaTotal) || 0)) : undefined;
        const shouldApplyInterviewQuotaTopUp =
            parsedInterviewQuotaTopUp !== undefined && parsedInterviewQuotaTopUp > 0;
        const existingOrg = await prisma.organization.findUnique({
            where: { id },
            select: {
                status: true,
                interviewQuotaTotal: true,
                interviewQuotaUsed: true,
                plan: true,
                voiceId: true,
                allowedVoices: true,
                recordingEnabled: true,
                recordingRetentionDays: true,
            },
        });
        if (!existingOrg) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }
        const statusControlRows = await prisma.$queryRaw<Array<{ statusControl: string | null }>>(
            Prisma.sql`
                SELECT "statusControl"
                FROM "Organization"
                WHERE id = ${id}
                LIMIT 1
            `
        );
        const currentStatusControl = normalizeOrgStatusControl(statusControlRows[0]?.statusControl);
        const directStatus = status !== undefined ? String(status || "").trim().toUpperCase() : undefined;
        const nextStatusControl =
            directStatus === "SUSPENDED"
                ? ORG_STATUS_CONTROL_MANUAL
                : directStatus === "ACTIVE"
                    ? ORG_STATUS_CONTROL_QUOTA
                    : undefined;
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
        const currentInterviewQuotaTotal = Math.max(0, Math.round(Number(existingOrg.interviewQuotaTotal || 0)));
        const shouldUpdateInterviewQuotaTotal =
            parsedInterviewQuotaTotal !== undefined &&
            !isNaN(parsedInterviewQuotaTotal) &&
            parsedInterviewQuotaTotal >= 0 &&
            parsedInterviewQuotaTotal !== currentInterviewQuotaTotal;
        const statusOnlyFieldsPresent =
            status !== undefined &&
            name === undefined &&
            plan === undefined &&
            slug === undefined &&
            maxActiveDrives === undefined &&
            recordingEnabled === undefined &&
            recordingRetentionDays === undefined &&
            proctoringSignals === undefined &&
            adminEmail === undefined &&
            adminPassword === undefined &&
            voiceId === undefined &&
            allowedVoices === undefined &&
            interviewQuotaTopUp === undefined;
        const shouldSyncQuotaStatus = shouldUpdateInterviewQuotaTotal || shouldApplyInterviewQuotaTopUp;
        if (statusOnlyFieldsPresent && !shouldSyncQuotaStatus) {
            await prisma.$executeRaw(
                Prisma.sql`
                    UPDATE "Organization"
                    SET "status" = ${directStatus},
                        "statusControl" = ${nextStatusControl ?? currentStatusControl}
                    WHERE id = ${id}
                `
            );
            return NextResponse.json({
                ...existingOrg,
                status: directStatus,
                statusControl: nextStatusControl ?? currentStatusControl,
            });
        }
        const normalizedPlan = plan !== undefined ? (normalizeOrgPlan(plan) || DEFAULT_ORG_PLAN) : null;
        // Build update - only write fields that were sent
        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (plan !== undefined) updateData.plan = normalizedPlan || plan;
        if (maxActiveDrives !== undefined && String(maxActiveDrives).trim() !== "") {
            updateData.maxActiveDrives = normalizeOrgLimitInput(maxActiveDrives);
        }
        if (maxConcurrentSlots !== undefined && maxConcurrentSlots !== null) {
            updateData.maxConcurrentSlots = Math.max(1, parseInt(maxConcurrentSlots));
        }
        if (proctoringSignals !== undefined) {
            updateData.proctoringSignals = normalizeProctoringSignals(proctoringSignals);
        }
        if (status !== undefined) {
            updateData.status = directStatus;
        }
        if (slug !== undefined) updateData.slug = slug;
        const currentRecordingRetentionDays = normalizeRecordingRetentionDays(existingOrg.recordingRetentionDays);
        const currentRecordingEnabled =
            existingOrg.recordingEnabled === true && currentRecordingRetentionDays !== null;
        const recordingEnabledProvided = recordingEnabled !== undefined;
        const recordingRetentionProvided = recordingRetentionDays !== undefined;
        const nextRecordingEnabled = recordingEnabledProvided
            ? recordingEnabled === true || recordingEnabled === "true"
            : currentRecordingEnabled;
        const nextRecordingRetentionDays = recordingRetentionProvided
            ? normalizeRecordingRetentionDays(recordingRetentionDays)
            : currentRecordingRetentionDays;
        if ((recordingEnabledProvided || recordingRetentionProvided) && nextRecordingEnabled && nextRecordingRetentionDays === null) {
            return NextResponse.json(
                { error: "Recording retention days are required when recording is enabled" },
                { status: 400 }
            );
        }
        if (recordingEnabledProvided || recordingRetentionProvided) {
            updateData.recordingEnabled = nextRecordingEnabled ? true : null;
            updateData.recordingRetentionDays = nextRecordingEnabled ? nextRecordingRetentionDays : null;
        }
        if (shouldUpdateInterviewQuotaTotal) {
            updateData.interviewQuotaTotal = parsedInterviewQuotaTotal;
        }
        Object.assign(
            updateData,
            normalizeOrgAiConfig({ voiceId, allowedVoices })
        );
        // Usage metrics -- internal API cost tracking, untouched by billing
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
            const normalizedEmail = normalizeEmail(adminEmail);
            const [existingUser, existingSuperAdmin] = await Promise.all([
                prisma.user.findFirst({
                    where: {
                        email: {
                            equals: normalizedEmail,
                            mode: "insensitive",
                        },
                    }
                }),
                prisma.superAdmin.findFirst({
                    where: {
                        email: {
                            equals: normalizedEmail,
                            mode: "insensitive",
                        },
                    }
                }),
            ]);
            if (existingSuperAdmin) {
                return NextResponse.json({
                    error: `The email "${normalizedEmail}" is already registered with another account. Please use a different one.`
                }, { status: 400 });
            }
            if (existingUser) {
                // Find the actual primary admin for this org
                const currentAdmin = await prisma.user.findFirst({
                    where: { orgId: id },
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
        if (adminPassword !== undefined && String(adminPassword).trim()) {
            const { isValid, error: passwordError } = validatePasswordStrength(String(adminPassword).trim());
            if (!isValid) {
                return NextResponse.json({ error: passwordError }, { status: 400 });
            }
        }
        // -- TRANSACTION: Update Org & Admin ------------------
        let primaryAdminId: string | null = null;
        const updated = await prisma.$transaction(async (tx) => {
            // 1. Update Org
            const org = await tx.organization.update({
                where: { id },
                data: updateData,
            });
            if (status !== undefined) {
                await tx.$executeRaw(
                    Prisma.sql`
                        UPDATE "Organization"
                        SET "statusControl" = ${nextStatusControl ?? currentStatusControl}
                        WHERE id = ${id}
                    `
                );
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
            // 2. Update Primary Admin if email/password provided
            if (adminEmail !== undefined || (adminPassword !== undefined && String(adminPassword).trim())) {
                // Find the first org user
                const admin = await tx.user.findFirst({
                    where: { orgId: id },
                    orderBy: { createdAt: "asc" }
                });
                if (admin) {
                    primaryAdminId = admin.id;
                    const adminUpdate: Record<string, unknown> = {};
                    if (adminEmail !== undefined) adminUpdate.email = normalizeEmail(adminEmail);
                    if (adminPassword !== undefined && String(adminPassword).trim()) {
                        adminUpdate.password = await bcrypt.hash(String(adminPassword).trim(), 10);
                    }
                    if (Object.keys(adminUpdate).length > 0) {
                        await tx.user.update({
                            where: { id: admin.id },
                            data: adminUpdate
                        });
                    }
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
        if (shouldSyncQuotaStatus || directStatus === "ACTIVE") {
            const syncedStatus = await syncOrgStatusWithInterviewQuota(id);
            if (syncedStatus) {
                updated.status = String(syncedStatus).toUpperCase();
            }
            updated.statusControl =
                directStatus === "ACTIVE"
                    ? ORG_STATUS_CONTROL_QUOTA
                    : nextStatusControl ?? currentStatusControl;
        }
        if (primaryAdminId && adminPassword !== undefined && String(adminPassword).trim()) {
            await invalidateUserSessions(primaryAdminId);
        }
        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating org:", error);
        return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
    }
}
// DELETE /api/super-admin/orgs/[id] - soft remove org and all its data
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
        // -- SOFT DELETE: DATABASE CLEANUP (Cascading) ---------------------------
        // We use raw SQL to handle appending timestamps to unique columns safely.
        await prisma.$transaction(async (tx) => {
            const timestamp = Date.now().toString();
            // 1. Soft Delete Organization (rename slug)
            await tx.$executeRaw`UPDATE "Organization" SET "isDeleted" = true, "slug" = 'del_' || ${timestamp} || '_' || "slug" WHERE "id" = ${id}`;
            // 2. Soft Delete Users (rename email)
            await tx.$executeRaw`UPDATE "User" SET "isDeleted" = true, "email" = 'del_' || ${timestamp} || '_' || "email" WHERE "orgId" = ${id}`;
            // 3. Soft Delete Drives
            await tx.$executeRaw`UPDATE "Drive" SET "isDeleted" = true WHERE "orgId" = ${id}`;
            // 4. Soft Delete Resume Candidates
            await tx.$executeRaw`
                UPDATE "ResumeCandidate" SET "isDeleted" = true 
                WHERE "driveId" IN (SELECT "id" FROM "Drive" WHERE "orgId" = ${id})
            `;
            // 6. Soft Delete Applications
            await tx.$executeRaw`
                UPDATE "Application" SET "isDeleted" = true 
                WHERE "driveId" IN (SELECT "id" FROM "Drive" WHERE "orgId" = ${id})
            `;
            // 7. Soft Delete Interviews (rename applicationId and accessToken)
            await tx.$executeRaw`
                UPDATE "Interview" 
                SET "isDeleted" = true, 
                    "applicationId" = 'del_' || ${timestamp} || '_' || "applicationId", 
                    "accessToken" = 'del_' || ${timestamp} || '_' || "accessToken"
                WHERE "applicationId" IN (
                    SELECT "id" FROM "Application" WHERE "driveId" IN (
                        SELECT "id" FROM "Drive" WHERE "orgId" = ${id}
                    )
                )
            `;
            // 8. Soft Delete Support Tickets
            await tx.$executeRaw`
                UPDATE "SupportTicket" SET "status" = 'DELETED'
                WHERE "interviewId" IN (
                    SELECT "id" FROM "Interview" WHERE "applicationId" IN (
                        SELECT "id" FROM "Application" WHERE "driveId" IN (
                            SELECT "id" FROM "Drive" WHERE "orgId" = ${id}
                        )
                    )
                )
            `;
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting org:", error);
        return NextResponse.json({ error: "Failed to delete organization" }, { status: 500 });
    }
}
