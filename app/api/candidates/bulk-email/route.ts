import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendApplicationStatusEmail } from "@/lib/mail";
import { getOrgBillingStatus } from "@/lib/credits";
import { getInterviewActionBlockedMessage, isInterviewQuotaLocked } from "@/lib/interview-quota";
import { invitationDeliveryQueue } from "@/lib/queue";
import { appendCandidateActivity } from "@/lib/candidate-activity";

type BulkEmailAction = "shortlist" | "reject" | "hire" | "nothired" | null;

function resolveAction(
    app: {
        resumeStatus: string | null;
        hiringStatus: string | null;
    },
    emailType: "screening" | "hiring",
    targetAction?: "shortlist" | "reject" | "hire" | "nothired",
): BulkEmailAction {
    if (targetAction) {
        return targetAction;
    }

    const resumeStatus = (app.resumeStatus || "").toLowerCase().trim();
    const hiringStatus = (app.hiringStatus || "").toLowerCase().trim();

    if (emailType === "hiring") {
        if (hiringStatus === "hired" || hiringStatus === "hire") return "hire";
        if (
            hiringStatus === "not hired" ||
            hiringStatus === "nothired" ||
            hiringStatus === "not shortlisted" ||
            hiringStatus === "rejected"
        ) {
            return "nothired";
        }
        return null;
    }

    if (resumeStatus === "shortlisted" || resumeStatus === "shortlist") return "shortlist";
    if (resumeStatus === "rejected" || resumeStatus === "reject") return "reject";
    return null;
}

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const orgId = session.orgId;
        if (!orgId) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const [org, billing] = await Promise.all([
            prisma.organization.findUnique({
                where: { id: orgId },
                select: { status: true },
            }),
            getOrgBillingStatus(orgId),
        ]);

        const isSuspended = String(org?.status || "").toUpperCase() === "SUSPENDED" || String(org?.status || "").toUpperCase() === "CLOSED";
        const quotaLocked = isInterviewQuotaLocked(billing);
        if (isSuspended || quotaLocked) {
            return NextResponse.json(
                {
                    error: getInterviewActionBlockedMessage(isSuspended),
                    code: isSuspended ? "ACCOUNT_SUSPENDED" : "NO_INTERVIEWS",
                },
                { status: isSuspended ? 403 : 402 }
            );
        }

        const {
            ids,
            emailType = "screening",
            targetAction,
            scheduleDays,
        }: {
            ids: string[];
            emailType?: "screening" | "hiring";
            targetAction?: "shortlist" | "reject" | "hire" | "nothired";
            scheduleDays?: number;
        } = await request.json();

        if (!ids?.length) {
            return NextResponse.json({ error: "ids are required" }, { status: 400 });
        }

        const applications = await (prisma.application as any).findMany({
            where: { id: { in: ids }, drive: { orgId } },
            select: {
                id: true,
                fullName: true,
                email: true,
                resumeStatus: true,
                hiringStatus: true,
                drive: {
                    select: {
                        id: true,
                        title: true,
                        orgId: true,
                        status: true,
                        inviteScheduleDays: true,
                    },
                },
            },
        });

        if (!applications.length) {
            return NextResponse.json({ error: "No matching candidates found" }, { status: 404 });
        }

        const orderMap = new Map(ids.map((id, index) => [id, index]));
        const orderedApplications = [...applications].sort(
            (a, b) => (orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER)
        );

        const plannedDeliveries: Array<{
            app: (typeof orderedApplications)[number];
            action: Exclude<BulkEmailAction, null>;
            scheduleDays: number;
        }> = [];
        const skipReasons: string[] = [];

        for (const app of orderedApplications) {
            if (!app.email) {
                console.warn(`[bulk-email] Skipping ${app.id} - no email address`);
                skipReasons.push(`${app.fullName || app.id}: Missing email address`);
                continue;
            }

            if (app.drive?.status && app.drive.status !== "ACTIVE") {
                console.warn(`[bulk-email] Skipping ${app.id} - drive is ${app.drive.status}`);
                skipReasons.push(`${app.fullName || app.email}: Drive is ${app.drive.status.toLowerCase()}.`);
                continue;
            }

            const action = resolveAction(app, emailType, targetAction);
            if (!action) {
                console.warn(`[bulk-email] Skipping ${app.id} - resolved action is empty.`);
                const currentStatus = emailType === "hiring"
                    ? `Hiring: ${app.hiringStatus || "None"}`
                    : `Resume: ${app.resumeStatus || "None"}`;
                skipReasons.push(`${app.fullName || app.email}: Cannot send email for status '${currentStatus}'. Please shortlist/reject first.`);
                continue;
            }

            plannedDeliveries.push({
                app,
                action,
                scheduleDays: 1,
            });
        }

        if (!plannedDeliveries.length) {
            const firstReason = skipReasons[0] || "No eligible candidates";
            return NextResponse.json({
                error: "No emails could be sent",
                reasons: skipReasons,
                message: firstReason,
                sent: 0,
                skipped: skipReasons.length,
            }, { status: 400 });
        }

        let sent = 0;
        let queued = 0;
        const failures: Array<{ id: string; reason: string }> = [];
        const shortlistApps = plannedDeliveries.filter(({ action }) => action === "shortlist");
        const directDeliveries = plannedDeliveries.filter(({ action }) => action !== "shortlist");
        const shortlistSpreadDays = Math.max(
            1,
            Number(scheduleDays ?? orderedApplications[0]?.drive?.inviteScheduleDays ?? 1) || 1
        );
        const shortlistWindowMs = Math.max(0, shortlistSpreadDays - 1) * 24 * 60 * 60 * 1000;

        for (let index = 0; index < shortlistApps.length; index += 1) {
            const { app } = shortlistApps[index];
            try {
                const delayMs = shortlistApps.length > 1 && shortlistWindowMs > 0
                    ? Math.round((index / Math.max(1, shortlistApps.length - 1)) * shortlistWindowMs)
                    : 0;

                await invitationDeliveryQueue.add(
                    "send-shortlist-email",
                    {
                        applicationId: app.id,
                        action: "shortlist",
                        emailType: "screening",
                        scheduledAt: new Date(Date.now() + delayMs).toISOString(),
                    },
                    { delay: delayMs }
                );
                queued += 1;
                await appendCandidateActivity(app.id, {
                    type: "email_sent",
                    label: "Shortlisted email queued",
                    details: `Scheduled for ${new Date(Date.now() + delayMs).toISOString()}`,
                    timestamp: new Date().toISOString(),
                    source: "worker",
                });
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                console.error("[bulk-email] queue failed:", {
                    applicationId: app.id,
                    action: "shortlist",
                    reason,
                });
                failures.push({
                    id: app.id,
                    reason,
                });
            }
        }

        const directResults = await Promise.allSettled(
            directDeliveries.map(async ({ app, action }) => {
                const status = action === "hire" ? "Hired" : "REJECTED";
                const mailResult = await sendApplicationStatusEmail({
                    email: app.email,
                    fullName: app.fullName || "Candidate",
                    jobTitle: app.drive?.title || "Unknown Role",
                    orgId: app.drive?.orgId ?? undefined,
                    status,
                    score: app.fullName ? 0 : 0,
                });

                if (!mailResult.success) {
                    throw new Error(
                        typeof mailResult.error === "string"
                            ? mailResult.error
                            : (mailResult.error as any)?.message || "Unknown email delivery error"
                    );
                }

                await appendCandidateActivity(app.id, {
                    type: "email_sent",
                    label: action === "hire" ? "Hire email sent" : "Rejection email sent",
                    details: `Sent at ${new Date().toISOString()}`,
                    timestamp: new Date().toISOString(),
                    source: "system",
                });

                return app.id;
            })
        );

        for (const result of directResults) {
            if (result.status === "fulfilled") {
                sent += 1;
                continue;
            }

            const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
            console.error("[bulk-email] send failed:", reason);
            failures.push({
                id: "unknown",
                reason,
            });
        }

        if (sent === 0 && queued === 0) {
            return NextResponse.json({
                error: "Failed to send emails",
                sent: 0,
                queued: 0,
                skipped: skipReasons.length,
                reasons: skipReasons,
                failures,
            }, { status: 500 });
        }

        const messageParts: string[] = [];
        if (queued > 0) messageParts.push(`Queued ${queued} shortlist email${queued !== 1 ? "s" : ""}`);
        if (sent > 0) messageParts.push(`Sent ${sent} email${sent !== 1 ? "s" : ""}`);
        const message = messageParts.join(" and ") + ".";

        return NextResponse.json({
            message,
            sent,
            queued,
            skipped: skipReasons.length,
            reasons: skipReasons,
            failures,
        });
    } catch (error) {
        console.error("[bulk-email] error:", error);
        return NextResponse.json({ error: "Failed to send emails" }, { status: 500 });
    }
}
