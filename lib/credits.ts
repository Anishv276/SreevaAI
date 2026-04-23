/**
 * Credit billing system.
 * Uses dedicated creditsTotal / creditsUsed columns on Organization (Float).
 * Completely separate from usageMetrics (which tracks API cost for internal use).
 *
 * Rate: 0.2 credits per minute (second-precision).
 * Formula: round(durationSeconds / 60 * 0.2, 2)
 *
 * Examples:
 *   1m 00s (60s)   = 0.20 credits
 *   1m 30s (90s)   = 0.30 credits
 *   4m 10s (250s)  = 0.83 credits
 *   5m 00s (300s)  = 1.00 credit
 *   6m 20s (380s)  = 1.27 credits
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const CREDITS_PER_MINUTE = 0.2;

export interface CreditStatus {
    creditsTotal: number;
    creditsUsed: number;
    creditsRemaining: number;
    minutesTotal: number;
    minutesUsed: number;
    minutesRemaining: number;
    hasSufficientCredits: boolean;
}

export async function getOrgCreditStatus(orgId: string): Promise<CreditStatus> {
    const org = await prisma.$queryRaw<Array<{ creditsTotal: number | null; creditsUsed: number | null }>>(
        Prisma.sql`
            SELECT "creditsTotal", "creditsUsed"
            FROM "Organization"
            WHERE id = ${orgId}
            LIMIT 1
        `
    );

    const creditsTotal = org[0]?.creditsTotal ?? 0;
    const creditsUsed = org[0]?.creditsUsed ?? 0;
    const creditsRemaining = Math.max(0, Math.round((creditsTotal - creditsUsed) * 100) / 100);

    return {
        creditsTotal,
        creditsUsed,
        creditsRemaining,
        minutesTotal: Math.round(creditsTotal / CREDITS_PER_MINUTE),
        minutesUsed: Math.round(creditsUsed / CREDITS_PER_MINUTE),
        minutesRemaining: Math.round(creditsRemaining / CREDITS_PER_MINUTE),
        hasSufficientCredits: creditsRemaining > 0,
    };
}

/**
 * Deduct credits at interview completion.
 * 0.2 credits per minute, second-precision, rounded to 2dp.
 */
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
