/**
 * Billing helpers for organizations.
 *
 * The app now tracks two separate concepts:
 * - interview quota: the customer-facing count of available interviews
 * - credits used: the internal usage counter stored on the organization row
 *
 * Existing callers still import this module as "credits", so we keep that filename
 * while exposing interview and usage status helpers.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const INTERVIEW_QUOTA_THRESHOLD_SECONDS = 5 * 60;

export interface BillingStatus {
    interviewQuotaTotal: number;
    interviewQuotaUsed: number;
    interviewQuotaRemaining: number;
    creditsUsed: number;
    minutesUsed: number;
    hasSufficientInterviews: boolean;
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
        creditsUsed: number | null;
    }>>(
        Prisma.sql`
            SELECT
                "interviewQuotaTotal",
                "interviewQuotaUsed",
                "creditsUsed"
            FROM "Organization"
            WHERE id = ${orgId}
            LIMIT 1
        `
    );

    const interviewQuotaTotal = org[0]?.interviewQuotaTotal ?? 0;
    const interviewQuotaUsed = org[0]?.interviewQuotaUsed ?? 0;
    const interviewQuotaRemaining = Math.max(0, interviewQuotaTotal - interviewQuotaUsed);
    const creditsUsed = Number(org[0]?.creditsUsed ?? 0);

    return {
        interviewQuotaTotal,
        interviewQuotaUsed,
        interviewQuotaRemaining,
        creditsUsed,
        minutesUsed: Math.round(creditsUsed),
        hasSufficientInterviews: interviewQuotaRemaining > 0,
    };
}

export async function getOrgCreditStatus(orgId: string): Promise<CreditStatus> {
    return getOrgBillingStatus(orgId);
}

export async function incrementOrgCreditsUsed(orgId: string, creditsDelta: number): Promise<number> {
    const normalizedDelta = Number.isFinite(creditsDelta) ? Math.max(0, creditsDelta) : 0;
    if (normalizedDelta <= 0) {
        const current = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { creditsUsed: true },
        });
        return Number(current?.creditsUsed ?? 0);
    }

    const updated = await prisma.$queryRaw<Array<{ creditsUsed: number | null }>>(
        Prisma.sql`
            UPDATE "Organization"
            SET "creditsUsed" = COALESCE("creditsUsed", 0) + ${normalizedDelta}
            WHERE id = ${orgId}
            RETURNING "creditsUsed"
        `
    );

    return Number(updated[0]?.creditsUsed ?? 0);
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
