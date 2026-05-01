import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { generateId } from "@/lib/ids";
import { sendApplicationStatusEmail } from "@/lib/mail";
import { getOrgBillingStatus } from "@/lib/credits";
import { getInterviewActionBlockedMessage, isInterviewQuotaLocked } from "@/lib/interview-quota";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { v4 as uuidv4 } from "uuid";

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
        const failures: Array<{ id: string; reason: string }> = [];

        for (const { app, action } of plannedDeliveries) {
            try {
                let interviewLink: string | undefined;
                if (action === "shortlist") {
                    const newToken = uuidv4();
                    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
                    await (prisma.interview as any).upsert({
                        where: { applicationId: app.id },
                        update: {
                            accessToken: newToken,
                            scheduledAt: new Date(),
                            inviteSentAt: new Date(),
                            expiresAt,
                            status: "PENDING",
                            startedAt: null,
                            completedAt: null,
                        },
                        create: {
                            id: generateId("int", app.fullName || app.id),
                            applicationId: app.id,
                            accessToken: newToken,
                            scheduledAt: new Date(),
                            inviteSentAt: new Date(),
                            expiresAt,
                            status: "PENDING",
                        },
                    });
                    const interviewBase = `${process.env.NEXT_PUBLIC_APP_URL || "https://sreevaai.com"}/interview/${app.id}`;
                    interviewLink = isInterviewTokenRequired()
                        ? `${interviewBase}?token=${newToken}`
                        : interviewBase;
                }

                const status = action === "shortlist"
                    ? "ACCEPTED"
                    : action === "hire"
                        ? "Hired"
                        : "REJECTED";

                const mailResult = await sendApplicationStatusEmail({
                    email: app.email,
                    fullName: app.fullName || "Candidate",
                    jobTitle: app.drive?.title || "Unknown Role",
                    orgId: app.drive?.orgId ?? undefined,
                    status,
                    score: app.fullName ? 0 : 0,
                    interviewLink,
                });

                if (!mailResult.success) {
                    throw new Error(
                        typeof mailResult.error === "string"
                            ? mailResult.error
                            : (mailResult.error as any)?.message || "Unknown email delivery error"
                    );
                }

                sent += 1;
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                console.error("[bulk-email] send failed:", {
                    applicationId: app.id,
                    action,
                    reason,
                });
                failures.push({
                    id: app.id,
                    reason,
                });
            }
        }

        const message = `Sent ${sent} email${sent !== 1 ? "s" : ""}.`;

        if (sent === 0) {
            return NextResponse.json({
                error: "Failed to send emails",
                sent: 0,
                skipped: skipReasons.length,
                reasons: skipReasons,
                failures,
            }, { status: 500 });
        }

        return NextResponse.json({
            message,
            sent,
            queued: sent,
            skipped: skipReasons.length,
            reasons: skipReasons,
            failures,
        });
    } catch (error) {
        console.error("[bulk-email] error:", error);
        return NextResponse.json({ error: "Failed to send emails" }, { status: 500 });
    }
}
