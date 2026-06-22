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
export const ORG_STATUS_CONTROL_MANUAL = "MANUAL";
export const ORG_STATUS_CONTROL_QUOTA = "QUOTA";
export type OrgStatusControl = typeof ORG_STATUS_CONTROL_MANUAL | typeof ORG_STATUS_CONTROL_QUOTA;
export interface BillingStatus {
    interviewQuotaTotal: number;
    interviewQuotaUsed: number;
    interviewQuotaRemaining: number;
    creditsUsed: number;
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
            WHERE id = ${orgId} AND "isDeleted" = false
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
        minutesUsed: creditsUsed,
        hasSufficientInterviews: interviewQuotaRemaining > 0,
    };
}
export async function getOrgCreditStatus(orgId: string): Promise<CreditStatus> {
    return getOrgBillingStatus(orgId);
}
export async function syncOrgStatusWithInterviewQuota(orgId: string): Promise<string | null> {
    const rows = await prisma.$queryRaw<Array<{
        status: string | null;
        interviewQuotaTotal: number | null;
        interviewQuotaUsed: number | null;
        statusControl: string | null;
    }>>(
        Prisma.sql`
            SELECT "status", "interviewQuotaTotal", "interviewQuotaUsed", "statusControl"
            FROM "Organization"
            WHERE id = ${orgId} AND "isDeleted" = false
            LIMIT 1
        `
    );
    const current = rows[0];
    if (!current) {
        return null;
    }
    const interviewQuotaTotal = Number(current.interviewQuotaTotal || 0);
    const interviewQuotaUsed = Number(current.interviewQuotaUsed || 0);
    const interviewQuotaRemaining = Math.max(0, interviewQuotaTotal - interviewQuotaUsed);
    const currentStatus = String(current.status || "ACTIVE").toUpperCase();
    if (currentStatus === "CLOSED") {
        return "CLOSED";
    }
    const statusControl = normalizeOrgStatusControl(current.statusControl);
    if (statusControl === ORG_STATUS_CONTROL_MANUAL) {
        if (currentStatus !== "SUSPENDED") {
            await prisma.organization.update({
                where: { id: orgId },
                data: { status: "SUSPENDED" },
            });
        }
        return "SUSPENDED";
    }
    if (interviewQuotaTotal > 0 && interviewQuotaRemaining <= 0 && currentStatus !== "SUSPENDED") {
        await prisma.organization.update({
            where: { id: orgId },
            data: { status: "SUSPENDED" },
        });
        return "SUSPENDED";
    }
    if (interviewQuotaTotal > 0 && interviewQuotaRemaining > 0 && currentStatus !== "ACTIVE") {
        await prisma.organization.update({
            where: { id: orgId },
            data: { status: "ACTIVE" },
        });
        return "ACTIVE";
    }
    return currentStatus;
}
export async function getEffectiveOrgStatus(orgId: string): Promise<string | null> {
    // ⚡ Single query — fetch all needed columns in one round-trip
    const rows = await prisma.$queryRaw<Array<{
        status: string | null;
        interviewQuotaTotal: number | null;
        interviewQuotaUsed: number | null;
        statusControl: string | null;
    }>>(
        Prisma.sql`
            SELECT "status", "interviewQuotaTotal", "interviewQuotaUsed", "statusControl"
            FROM "Organization"
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
    const interviewQuotaTotal = Number(current.interviewQuotaTotal || 0);
    const interviewQuotaUsed = Number(current.interviewQuotaUsed || 0);
    const interviewQuotaRemaining = Math.max(0, interviewQuotaTotal - interviewQuotaUsed);
    if (interviewQuotaTotal > 0 && interviewQuotaRemaining <= 0) {
        return "SUSPENDED";
    }
    if (interviewQuotaTotal > 0 && interviewQuotaRemaining > 0) {
        return "ACTIVE";
    }
    return String(current.status || "ACTIVE").toUpperCase();
}
