import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { generateId } from "@/lib/ids";
import { invitationDeliveryQueue } from "@/lib/queue";

const DAY_MS = 24 * 60 * 60 * 1000;

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

function getDriveScheduleDays(drive: {
    inviteScheduleDays?: number | null;
}) {
    return Number(drive.inviteScheduleDays ?? 1) || 1;
}

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const orgId = session.orgId;
        if (!orgId) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

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

            const driveScheduleDays = getDriveScheduleDays(app.drive || {});
            const effectiveScheduleDays = emailType === "screening"
                ? Math.max(1, Number(scheduleDays ?? driveScheduleDays ?? 1))
                : 1;

            plannedDeliveries.push({
                app,
                action,
                scheduleDays: effectiveScheduleDays,
            });
        }

        if (!plannedDeliveries.length) {
            const firstReason = skipReasons[0] || "No eligible candidates";
            return NextResponse.json({
                error: "No emails could be queued",
                reasons: skipReasons,
                message: firstReason,
                queued: 0,
                skipped: skipReasons.length,
            }, { status: 400 });
        }

        let queued = 0;
        const failures: Array<{ id: string; reason: string }> = [];

        for (let index = 0; index < plannedDeliveries.length; index += 1) {
            const { app, action, scheduleDays } = plannedDeliveries[index];
            const dayOffset = emailType === "screening"
                ? Math.floor((index * scheduleDays) / plannedDeliveries.length)
                : 0;
            const scheduledAt = new Date(Date.now() + dayOffset * DAY_MS);
            const delay = Math.max(0, scheduledAt.getTime() - Date.now());
            const jobId = generateId("inv", `${app.id}-${action}-${scheduledAt.getTime()}`);

            try {
                if (action === "shortlist") {
                    await (prisma.interview as any).upsert({
                        where: { applicationId: app.id },
                        update: {
                            scheduledAt,
                            status: "PENDING",
                        },
                        create: {
                            id: generateId("int", app.fullName || app.id),
                            applicationId: app.id,
                            scheduledAt,
                            status: "PENDING",
                        },
                    });
                }

                await invitationDeliveryQueue.add(
                    "deliver-invitation",
                    {
                        applicationId: app.id,
                        action,
                        emailType,
                        scheduledAt: scheduledAt.toISOString(),
                    },
                    {
                        jobId,
                        delay,
                    }
                );

                queued += 1;
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                console.error("[bulk-email] queue failed:", {
                    applicationId: app.id,
                    action,
                    scheduledAt: scheduledAt.toISOString(),
                    reason,
                });
                failures.push({
                    id: app.id,
                    reason,
                });
            }
        }

        const delayed = plannedDeliveries.filter((item, index) => emailType === "screening" && Math.floor((index * item.scheduleDays) / plannedDeliveries.length) > 0).length;
        const immediate = queued - delayed;
        const message = delayed > 0
            ? `Queued ${queued} email${queued !== 1 ? "s" : ""} (${immediate} immediate, ${delayed} scheduled).`
            : `Queued ${queued} email${queued !== 1 ? "s" : ""}.`;

        if (queued === 0) {
            return NextResponse.json({
                error: "Failed to queue emails",
                queued: 0,
                skipped: skipReasons.length,
                reasons: skipReasons,
                failures,
            }, { status: 500 });
        }

        return NextResponse.json({
            message,
            queued,
            sent: queued,
            skipped: skipReasons.length,
            reasons: skipReasons,
            failures,
        });
    } catch (error) {
        console.error("[bulk-email] error:", error);
        return NextResponse.json({ error: "Failed to queue emails" }, { status: 500 });
    }
}
