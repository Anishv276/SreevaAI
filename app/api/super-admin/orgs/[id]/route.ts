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
import { apiErrorResponse } from "@/lib/slack-error-logger";
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
        const org = await prisma.organizationDetails.findUnique({
            where: { id },
            include: {
                organizationCredentials: {
                    where: { isDeleted: false },
                    select: { id: true, name: true, email: true }
                }
            }
        });
        const billingRows = await prisma.$queryRaw<Array<{
            totalInterviewsAllowed: number | null;
            totalInterviewsUsed: number | null;
            billingCreditsUsed: number | null;
        }>>(
            Prisma.sql`
                SELECT "totalInterviewsAllowed", "totalInterviewsUsed", "billingCreditsUsed"
                FROM "OrganizationDetails"
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
            status: String(effectiveStatus || org.orgStatus || "ACTIVE").toUpperCase(),
            totalInterviewsAllowed: billingRows[0]?.totalInterviewsAllowed ?? 0,
            totalInterviewsUsed: billingRows[0]?.totalInterviewsUsed ?? 0,
            billingCreditsUsed: billingRows[0]?.billingCreditsUsed ?? 0,
            proctoringSignals: org.enabledProctoringSignals,
            maxConcurrentSlots: org.maxConcurrentInterviews,
            recordingEnabled: org.isRecordingEnabled === true && org.recordingKeepForDays != null,
            recordingRetentionDays: org.recordingKeepForDays,
        });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/super-admin/orgs/[id]",
            method: "GET",
            error,
            body: { error: "Failed to fetch organization" },
            status: 500,
            logLabel: "Error fetching org:",
        });
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
            name, billingPlan, status, urlSlug, maxActiveJobs,
            recordingEnabled, recordingRetentionDays,
            proctoringSignals,
            adminEmail,
            adminPassword,
            allowedVoiceIds,
            totalInterviewsAllowed,
            interviewQuotaTopUp,
            maxConcurrentSlots,
            planPriceUsd,
            billingCycle,
            nextBillingDate,
        } = body;
        const parsedInterviewQuotaTopUp =
            interviewQuotaTopUp !== undefined ? Math.max(0, Math.round(Number(interviewQuotaTopUp) || 0)) : undefined;
        const parsedInterviewQuotaTotal =
            totalInterviewsAllowed !== undefined ? Math.max(0, Math.round(Number(totalInterviewsAllowed) || 0)) : undefined;
        const shouldApplyInterviewQuotaTopUp =
            parsedInterviewQuotaTopUp !== undefined && parsedInterviewQuotaTopUp > 0;
        const existingOrg = await prisma.organizationDetails.findUnique({
            where: { id },
            select: {
                orgStatus: true,
                totalInterviewsAllowed: true,
                totalInterviewsUsed: true,
                billingPlan: true,
                allowedVoiceIds: true,
                isRecordingEnabled: true,
                recordingKeepForDays: true,
            },
        });
        if (!existingOrg) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }
        const statusControlRows = await prisma.$queryRaw<Array<{ statusControl: string | null }>>(
            Prisma.sql`
                SELECT "quotaControlMode" AS "statusControl"
                FROM "OrganizationDetails"
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
        if (billingPlan && !isOrgPlan(billingPlan)) {
            return NextResponse.json({ error: "Invalid organization plan" }, { status: 400 });
        }
        if (status && !["ACTIVE", "SUSPENDED", "PENDING", "DEACTIVATED", "CLOSED"].includes(status)) {
            return NextResponse.json({ error: "Invalid organization status" }, { status: 400 });
        }
        const currentInterviewQuotaTotal = Math.max(0, Math.round(Number(existingOrg.totalInterviewsAllowed || 0)));
        const shouldUpdateInterviewQuotaTotal =
            parsedInterviewQuotaTotal !== undefined &&
            !isNaN(parsedInterviewQuotaTotal) &&
            parsedInterviewQuotaTotal >= 0 &&
            parsedInterviewQuotaTotal !== currentInterviewQuotaTotal;
        const statusOnlyFieldsPresent =
            status !== undefined &&
            name === undefined &&
            billingPlan === undefined &&
            urlSlug === undefined &&
            maxActiveJobs === undefined &&
            recordingEnabled === undefined &&
            recordingRetentionDays === undefined &&
            proctoringSignals === undefined &&
            adminEmail === undefined &&
            adminPassword === undefined &&
            allowedVoiceIds === undefined &&
            interviewQuotaTopUp === undefined;
        const shouldSyncQuotaStatus = shouldUpdateInterviewQuotaTotal || shouldApplyInterviewQuotaTopUp;
        if (statusOnlyFieldsPresent && !shouldSyncQuotaStatus) {
            await prisma.$executeRaw(
                Prisma.sql`
                    UPDATE "OrganizationDetails"
                    SET "orgStatus" = ${directStatus},
                        "quotaControlMode" = ${nextStatusControl ?? currentStatusControl}
                    WHERE id = ${id}
                `
            );
            return NextResponse.json({
                ...existingOrg,
                status: directStatus,
                statusControl: nextStatusControl ?? currentStatusControl,
            });
        }
        const normalizedPlan = billingPlan !== undefined ? (normalizeOrgPlan(billingPlan) || DEFAULT_ORG_PLAN) : null;
        // Build update - only write fields that were sent
        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (billingPlan !== undefined) updateData.billingPlan = normalizedPlan || billingPlan;
        if (maxActiveJobs !== undefined && String(maxActiveJobs).trim() !== "") {
            updateData.maxActiveJobs = normalizeOrgLimitInput(maxActiveJobs);
        }
        if (maxConcurrentSlots !== undefined && maxConcurrentSlots !== null) {
            updateData.maxConcurrentInterviews = Math.max(1, parseInt(maxConcurrentSlots));
        }
        if (proctoringSignals !== undefined) {
            updateData.enabledProctoringSignals = normalizeProctoringSignals(proctoringSignals);
        }
        if (status !== undefined) {
            updateData.orgStatus = directStatus;
        }
        if (urlSlug !== undefined) updateData.urlSlug = urlSlug;
        const currentRecordingRetentionDays = normalizeRecordingRetentionDays(existingOrg.recordingKeepForDays);
        const currentRecordingEnabled =
            existingOrg.isRecordingEnabled === true && currentRecordingRetentionDays !== null;
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
            updateData.isRecordingEnabled = nextRecordingEnabled ? true : null;
            updateData.recordingKeepForDays = nextRecordingEnabled ? nextRecordingRetentionDays : null;
        }
        if (shouldUpdateInterviewQuotaTotal) {
            updateData.totalInterviewsAllowed = parsedInterviewQuotaTotal;
        }
        // -- Subscription display fields (maintained manually by super admin) ----
        if (planPriceUsd !== undefined) {
            const price = Number(planPriceUsd);
            if (planPriceUsd === null || planPriceUsd === "") {
                updateData.planPriceUsd = null;
            } else if (!Number.isFinite(price) || price < 0) {
                return NextResponse.json({ error: "planPriceUsd must be a non-negative number" }, { status: 400 });
            } else {
                updateData.planPriceUsd = price;
            }
        }
        if (billingCycle !== undefined) {
            if (billingCycle === null || billingCycle === "") {
                updateData.billingCycle = null;
            } else if (!["Monthly", "Yearly"].includes(String(billingCycle))) {
                return NextResponse.json({ error: "billingCycle must be 'Monthly' or 'Yearly'" }, { status: 400 });
            } else {
                updateData.billingCycle = String(billingCycle);
            }
        }
        if (nextBillingDate !== undefined) {
            if (nextBillingDate === null || nextBillingDate === "") {
                updateData.nextBillingDate = null;
            } else {
                const d = new Date(nextBillingDate);
                if (isNaN(d.getTime())) {
                    return NextResponse.json({ error: "nextBillingDate must be a valid date" }, { status: 400 });
                }
                updateData.nextBillingDate = d;
            }
        }
        Object.assign(
            updateData,
            normalizeOrgAiConfig({ allowedVoiceIds })
        );
        // ponytail: removed super-admin platformUsageMetrics override — that column
        // is gone; UsageEvent is now the sole source of truth for cost totals and
        // is not manually editable (out of scope, no replacement built).
        // -- EMAIL CONFLICT CHECK ----------------------------
        if (adminEmail) {
            const normalizedEmail = normalizeEmail(adminEmail);
            const [existingUser, existingSuperAdmin] = await Promise.all([
                prisma.organizationCredentials.findFirst({
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
                const currentAdmin = await prisma.organizationCredentials.findFirst({
                    where: { organizationId: id },
                    orderBy: { accountCreatedAt: "asc" }
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
            const org = await tx.organizationDetails.update({
                where: { id },
                data: updateData,
            });
            if (status !== undefined) {
                await tx.$executeRaw(
                    Prisma.sql`
                        UPDATE "OrganizationDetails"
                        SET "quotaControlMode" = ${nextStatusControl ?? currentStatusControl}
                        WHERE id = ${id}
                    `
                );
            }
            if (shouldApplyInterviewQuotaTopUp) {
                await tx.$executeRaw(
                    Prisma.sql`
                        UPDATE "OrganizationDetails"
                        SET "totalInterviewsAllowed" = COALESCE("totalInterviewsAllowed", 0) + ${parsedInterviewQuotaTopUp}
                        WHERE id = ${id}
                    `
                );
            }
            // 2. Update Primary Admin if email/password provided
            if (adminEmail !== undefined || (adminPassword !== undefined && String(adminPassword).trim())) {
                // Find the first org user
                const admin = await tx.organizationCredentials.findFirst({
                    where: { organizationId: id },
                    orderBy: { accountCreatedAt: "asc" }
                });
                if (admin) {
                    primaryAdminId = admin.id;
                    const adminUpdate: Record<string, unknown> = {};
                    if (adminEmail !== undefined) adminUpdate.email = normalizeEmail(adminEmail);
                    if (adminPassword !== undefined && String(adminPassword).trim()) {
                        adminUpdate.password = await bcrypt.hash(String(adminPassword).trim(), 10);
                    }
                    if (Object.keys(adminUpdate).length > 0) {
                        console.log("[ORG_EDIT_DEBUG] writing adminUpdate", { adminId: admin.id, adminUpdate });
                        const writeResult = await tx.organizationCredentials.update({
                            where: { id: admin.id },
                            data: adminUpdate
                        });
                        console.log("[ORG_EDIT_DEBUG] write result", { id: writeResult.id, email: writeResult.email });
                    } else {
                        console.log("[ORG_EDIT_DEBUG] adminUpdate empty, skipped write", { adminEmail, adminPassword });
                    }
                }
            }
            const billingRows = await tx.$queryRaw<Array<{
                totalInterviewsAllowed: number | null;
                totalInterviewsUsed: number | null;
                billingCreditsUsed: number | null;
            }>>(
                Prisma.sql`
                    SELECT "totalInterviewsAllowed", "totalInterviewsUsed", "billingCreditsUsed"
                    FROM "OrganizationDetails"
                    WHERE id = ${id}
                    LIMIT 1
                `
            );
            return {
                ...org,
                totalInterviewsAllowed: billingRows[0]?.totalInterviewsAllowed ?? 0,
                totalInterviewsUsed: billingRows[0]?.totalInterviewsUsed ?? 0,
                billingCreditsUsed: billingRows[0]?.billingCreditsUsed ?? 0,
            };
        });
        const result: Record<string, unknown> = {
            ...updated,
            proctoringSignals: updated.enabledProctoringSignals,
            maxConcurrentSlots: updated.maxConcurrentInterviews,
            recordingEnabled: updated.isRecordingEnabled === true && updated.recordingKeepForDays != null,
            recordingRetentionDays: updated.recordingKeepForDays,
        };
        if (shouldSyncQuotaStatus || directStatus === "ACTIVE") {
            const syncedStatus = await syncOrgStatusWithInterviewQuota(id);
            if (syncedStatus) {
                result.status = String(syncedStatus).toUpperCase();
            }
            result.statusControl =
                directStatus === "ACTIVE"
                    ? ORG_STATUS_CONTROL_QUOTA
                    : nextStatusControl ?? currentStatusControl;
        }
        if (primaryAdminId && adminPassword !== undefined && String(adminPassword).trim()) {
            await invalidateUserSessions(primaryAdminId);
        }
        return NextResponse.json(result);
    } catch (error) {
        return apiErrorResponse({
            route: "/api/super-admin/orgs/[id]",
            method: "PATCH",
            error,
            body: { error: "Failed to update organization" },
            status: 500,
            logLabel: "Error updating org:",
        });
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
            // 1. Soft Delete Organization (rename urlSlug)
            await tx.$executeRaw`UPDATE "OrganizationDetails" SET "isDeleted" = true, "urlSlug" = 'del_' || ${timestamp} || '_' || "urlSlug" WHERE "id" = ${id}`;
            // 2. Soft Delete Users (rename email)
            await tx.$executeRaw`UPDATE "OrganizationCredentials" SET "isDeleted" = true, "email" = 'del_' || ${timestamp} || '_' || "email" WHERE "organizationId" = ${id}`;
            // 3. Soft Delete Jobs
            await tx.$executeRaw`UPDATE "Job" SET "isDeleted" = true WHERE "organizationId" = ${id}`;
            // 6. Soft Delete Applications (Application holds candidate/resume data directly --
            // the separate ResumeCandidate table no longer exists)
            await tx.$executeRaw`
                UPDATE "Application" SET "isDeleted" = true
                WHERE "jobId" IN (SELECT "id" FROM "Job" WHERE "organizationId" = ${id})
            `;
            // 7. Soft Delete Interviews (rename candidateInviteToken only -- applicationId
            // is a real FK to Application.id, which is not renamed on soft delete, so
            // renaming it here would violate Interview_applicationId_fkey)
            await tx.$executeRaw`
                UPDATE "Interview"
                SET "isDeleted" = true,
                    "candidateInviteToken" = 'del_' || ${timestamp} || '_' || "candidateInviteToken"
                WHERE "applicationId" IN (
                    SELECT "id" FROM "Application" WHERE "jobId" IN (
                        SELECT "id" FROM "Job" WHERE "organizationId" = ${id}
                    )
                )
            `;
            // 8. Soft Delete Support Tickets
            await tx.$executeRaw`
                UPDATE "SupportTicket" SET "ticketStatus" = 'DELETED'
                WHERE "interviewId" IN (
                    SELECT "id" FROM "Interview" WHERE "applicationId" IN (
                        SELECT "id" FROM "Application" WHERE "jobId" IN (
                            SELECT "id" FROM "Job" WHERE "organizationId" = ${id}
                        )
                    )
                )
            `;
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/super-admin/orgs/[id]",
            method: "DELETE",
            error,
            body: { error: "Failed to delete organization" },
            status: 500,
            logLabel: "Error deleting org:",
        });
    }
}
