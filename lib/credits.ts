/**
 * Billing helpers for organizations.
 *
 * The app now tracks two separate concepts:
 * - interview quota: the customer-facing count of available interviews
 * - credits: the internal billing/usage counter that super-admins can still inspect
 *
 * Existing callers still import this module as "credits", so we keep that filename
 * while exposing both interview and credit status helpers.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const CREDITS_PER_MINUTE = 1;
export const INTERVIEW_QUOTA_THRESHOLD_SECONDS = 5 * 60;

export interface BillingStatus {
    interviewQuotaTotal: number;
    interviewQuotaUsed: number;
    interviewQuotaRemaining: number;
    creditsTotal: number;
    creditsUsed: number;
    creditsRemaining: number;
    minutesTotal: number;
    minutesUsed: number;
    minutesRemaining: number;
    hasSufficientInterviews: boolean;
    hasSufficientCredits: boolean;
}

export type CreditStatus = BillingStatus;

export function getInterviewQuotaUnits(durationSeconds: number): number {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        return 0;
    }

    return durationSeconds > INTERVIEW_QUOTA_THRESHOLD_SECONDS ? 1 : 0;
}

export async function getOrgBillingStatus(orgId: string): Promise<BillingStatus> {
    const org = await prisma.$queryRaw<Array<{
        interviewQuotaTotal: number | null;
        interviewQuotaUsed: number | null;
        creditsTotal: number | null;
        creditsUsed: number | null;
    }>>(
        Prisma.sql`
            SELECT
                "interviewQuotaTotal",
                "interviewQuotaUsed",
                "creditsTotal",
                "creditsUsed"
            FROM "Organization"
            WHERE id = ${orgId}
            LIMIT 1
        `
    );

    const interviewQuotaTotal = org[0]?.interviewQuotaTotal ?? 0;
    const interviewQuotaUsed = org[0]?.interviewQuotaUsed ?? 0;
    const interviewQuotaRemaining = Math.max(0, interviewQuotaTotal - interviewQuotaUsed);
    const creditsTotal = org[0]?.creditsTotal ?? 0;
    const creditsUsed = org[0]?.creditsUsed ?? 0;
    const creditsRemaining = Math.max(0, Math.round((creditsTotal - creditsUsed) * 100) / 100);

    return {
        interviewQuotaTotal,
        interviewQuotaUsed,
        interviewQuotaRemaining,
        creditsTotal,
        creditsUsed,
        creditsRemaining,
        minutesTotal: Math.round(creditsTotal / CREDITS_PER_MINUTE),
        minutesUsed: Math.round(creditsUsed / CREDITS_PER_MINUTE),
        minutesRemaining: Math.round(creditsRemaining / CREDITS_PER_MINUTE),
        hasSufficientInterviews: interviewQuotaRemaining > 0,
        hasSufficientCredits: creditsRemaining > 0,
    };
}

export async function getOrgCreditStatus(orgId: string): Promise<CreditStatus> {
    return getOrgBillingStatus(orgId);
}

export async function syncOrgStatusWithInterviewQuota(orgId: string): Promise<string | null> {
    const current = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { status: true, interviewQuotaTotal: true, interviewQuotaUsed: true },
    });

    if (!current) {
        return null;
    }

    const interviewQuotaTotal = Number(current.interviewQuotaTotal || 0);
    const interviewQuotaUsed = Number(current.interviewQuotaUsed || 0);
    const interviewQuotaRemaining = Math.max(0, interviewQuotaTotal - interviewQuotaUsed);

    if (interviewQuotaTotal > 0 && interviewQuotaRemaining <= 0 && current.status === "ACTIVE") {
        await prisma.organization.update({
            where: { id: orgId },
            data: { status: "SUSPENDED" },
        });
        return "SUSPENDED";
    }

    if (interviewQuotaTotal > 0 && interviewQuotaRemaining > 0 && current.status === "SUSPENDED") {
        await prisma.organization.update({
            where: { id: orgId },
            data: { status: "ACTIVE" },
        });
        return "ACTIVE";
    }

    return current.status;
}

async function autoSuspendOrgIfQuotaExhausted(orgId: string, interviewQuotaRemaining: number) {
    if (interviewQuotaRemaining > 0) {
        return false;
    }

    const nextStatus = await syncOrgStatusWithInterviewQuota(orgId);
    return nextStatus === "SUSPENDED";
}

/**
 * Deduct one interview from the org's quota at interview completion.
 */
export async function deductInterviewQuota(orgId: string, count = 1): Promise<{
    deducted: number;
    interviewQuotaRemaining: number;
}> {
    await prisma.$executeRaw(
        Prisma.sql`
            UPDATE "Organization"
            SET "interviewQuotaUsed" = COALESCE("interviewQuotaUsed", 0) + ${count}
            WHERE id = ${orgId}
        `
    );

    const updated = await prisma.$queryRaw<Array<{
        interviewQuotaTotal: number | null;
        interviewQuotaUsed: number | null;
    }>>(
        Prisma.sql`
            SELECT "interviewQuotaTotal", "interviewQuotaUsed"
            FROM "Organization"
            WHERE id = ${orgId}
            LIMIT 1
        `
    );
    const interviewQuotaTotal = updated[0]?.interviewQuotaTotal ?? 0;
    const interviewQuotaUsed = updated[0]?.interviewQuotaUsed ?? 0;
    const interviewQuotaRemaining = Math.max(0, interviewQuotaTotal - interviewQuotaUsed);

    try {
        await autoSuspendOrgIfQuotaExhausted(orgId, interviewQuotaRemaining);
    } catch (error) {
        console.error("[credits] Failed to auto-suspend exhausted org:", error);
    }

    return {
        deducted: count,
        interviewQuotaRemaining,
    };
}

export async function deductInterviewCredits(orgId: string, durationSeconds: number): Promise<{
    deducted: number;
    creditsRemaining: number;
}> {
    const minutes = durationSeconds / 60;
    const creditsToDeduct = Math.round(minutes * CREDITS_PER_MINUTE * 100) / 100;

    await prisma.$executeRaw(
        Prisma.sql`
            UPDATE "Organization"
            SET "creditsUsed" = COALESCE("creditsUsed", 0) + ${creditsToDeduct}
            WHERE id = ${orgId}
        `
    );

    const updated = await prisma.$queryRaw<Array<{ creditsTotal: number | null; creditsUsed: number | null }>>(
        Prisma.sql`
            SELECT "creditsTotal", "creditsUsed"
            FROM "Organization"
            WHERE id = ${orgId}
            LIMIT 1
        `
    );
    const creditsTotal = updated[0]?.creditsTotal ?? 0;
    const creditsUsed = updated[0]?.creditsUsed ?? 0;

    return {
        deducted: creditsToDeduct,
        creditsRemaining: Math.max(0, Math.round((creditsTotal - creditsUsed) * 100) / 100),
    };
}
