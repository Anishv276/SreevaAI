/**
 * Billing helpers for organizations.
 *
 * The app tracks two separate concepts:
 * - interview quota: the customer-facing count of available interviews
 * - billing credits used: the internal usage counter stored on the organization row
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
export const INTERVIEW_QUOTA_THRESHOLD_SECONDS = 5 * 60;
export const ORG_STATUS_CONTROL_MANUAL = "MANUAL";
export const ORG_STATUS_CONTROL_QUOTA = "QUOTA";
export type OrgStatusControl = typeof ORG_STATUS_CONTROL_MANUAL | typeof ORG_STATUS_CONTROL_QUOTA;
export interface BillingStatus {
    totalInterviewsAllowed: number;
    totalInterviewsUsed: number;
    interviewQuotaRemaining: number;
    billingCreditsUsed: number;
    minutesUsed: number;
    hasSufficientInterviews: boolean;
}
export type CreditStatus = BillingStatus;
export function normalizeOrgStatusControl(value: unknown): OrgStatusControl {
    return String(value || "").trim().toUpperCase() === ORG_STATUS_CONTROL_MANUAL
        ? ORG_STATUS_CONTROL_MANUAL
        : ORG_STATUS_CONTROL_QUOTA;
}
export function getInterviewQuotaUnits(durationSeconds: number): number {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        return 0;
    }
    // Every completed interview consumes one quota credit.
    // We still keep the duration guard so incomplete/empty sessions do not deduct quota.
    return 1;
}
export async function getOrgBillingStatus(orgId: string): Promise<BillingStatus> {
    const org = await prisma.$queryRaw<Array<{
        totalInterviewsAllowed: number | null;
        totalInterviewsUsed: number | null;
        billingCreditsUsed: number | null;
    }>>(
        Prisma.sql`
            SELECT
                "totalInterviewsAllowed",
                "totalInterviewsUsed",
                "billingCreditsUsed"
            FROM "OrganizationDetails"
            WHERE id = ${orgId} AND "isDeleted" = false
            LIMIT 1
        `
    );
    const totalInterviewsAllowed = org[0]?.totalInterviewsAllowed ?? 0;
    const totalInterviewsUsed = org[0]?.totalInterviewsUsed ?? 0;
    const interviewQuotaRemaining = Math.max(0, totalInterviewsAllowed - totalInterviewsUsed);
    const billingCreditsUsed = Number(org[0]?.billingCreditsUsed ?? 0);
    return {
        totalInterviewsAllowed,
        totalInterviewsUsed,
        interviewQuotaRemaining,
        billingCreditsUsed,
        minutesUsed: billingCreditsUsed,
        hasSufficientInterviews: interviewQuotaRemaining > 0,
    };
}
export async function getOrgCreditStatus(orgId: string): Promise<CreditStatus> {
    return getOrgBillingStatus(orgId);
}
export async function syncOrgStatusWithInterviewQuota(orgId: string): Promise<string | null> {
    const rows = await prisma.$queryRaw<Array<{
        status: string | null;
        totalInterviewsAllowed: number | null;
        totalInterviewsUsed: number | null;
        statusControl: string | null;
    }>>(
        Prisma.sql`
            SELECT
                "orgStatus"              AS "status",
                "totalInterviewsAllowed",
                "totalInterviewsUsed",
                "quotaControlMode"       AS "statusControl"
            FROM "OrganizationDetails"
            WHERE id = ${orgId} AND "isDeleted" = false
            LIMIT 1
        `
    );
    const current = rows[0];
    if (!current) {
        return null;
    }
    const totalInterviewsAllowed = Number(current.totalInterviewsAllowed || 0);
    const totalInterviewsUsed = Number(current.totalInterviewsUsed || 0);
    const interviewQuotaRemaining = Math.max(0, totalInterviewsAllowed - totalInterviewsUsed);
    const currentStatus = String(current.status || "ACTIVE").toUpperCase();
    if (currentStatus === "CLOSED") {
        return "CLOSED";
    }
    const statusControl = normalizeOrgStatusControl(current.statusControl);
    if (statusControl === ORG_STATUS_CONTROL_MANUAL) {
        if (currentStatus !== "SUSPENDED") {
            await prisma.organizationDetails.update({
                where: { id: orgId },
                data: { orgStatus: "SUSPENDED" },
            });
        }
        return "SUSPENDED";
    }
    if (totalInterviewsAllowed > 0 && interviewQuotaRemaining <= 0 && currentStatus !== "SUSPENDED") {
        await prisma.organizationDetails.update({
            where: { id: orgId },
            data: { orgStatus: "SUSPENDED" },
        });
        return "SUSPENDED";
    }
    if (totalInterviewsAllowed > 0 && interviewQuotaRemaining > 0 && currentStatus !== "ACTIVE") {
        await prisma.organizationDetails.update({
            where: { id: orgId },
            data: { orgStatus: "ACTIVE" },
        });
        return "ACTIVE";
    }
    return currentStatus;
}
export async function getEffectiveOrgStatus(orgId: string): Promise<string | null> {
    // ⚡ Single query -- fetch all needed columns in one round-trip
    const rows = await prisma.$queryRaw<Array<{
        status: string | null;
        totalInterviewsAllowed: number | null;
        totalInterviewsUsed: number | null;
        statusControl: string | null;
    }>>(
        Prisma.sql`
            SELECT
                "orgStatus"              AS "status",
                "totalInterviewsAllowed",
                "totalInterviewsUsed",
                "quotaControlMode"       AS "statusControl"
            FROM "OrganizationDetails"
            WHERE id = ${orgId} AND "isDeleted" = false
            LIMIT 1
        `
    );
    const current = rows[0];
    if (!current) return null;
    const statusControl = normalizeOrgStatusControl(current.statusControl);
    const currentStatus = String(current.status || "ACTIVE").toUpperCase();
    if (currentStatus === "CLOSED") {
        return "CLOSED";
    }
    if (statusControl === ORG_STATUS_CONTROL_MANUAL) {
        return "SUSPENDED";
    }
    const totalInterviewsAllowed = Number(current.totalInterviewsAllowed || 0);
    const totalInterviewsUsed = Number(current.totalInterviewsUsed || 0);
    const interviewQuotaRemaining = Math.max(0, totalInterviewsAllowed - totalInterviewsUsed);
    if (totalInterviewsAllowed > 0 && interviewQuotaRemaining <= 0) {
        return "SUSPENDED";
    }
    if (totalInterviewsAllowed > 0 && interviewQuotaRemaining > 0) {
        return "ACTIVE";
    }
    return String(current.status || "ACTIVE").toUpperCase();
}
