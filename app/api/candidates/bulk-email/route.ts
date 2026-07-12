import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendRejectionEmail } from "@/lib/mail";
import { getOrgBillingStatus } from "@/lib/credits";
import { getInterviewActionBlockedMessage, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { invitationDeliveryQueue } from "@/lib/queue";
import { appendCandidateActivity } from "@/lib/candidate-activity";
import { apiErrorResponse } from "@/lib/slack-error-logger";
type EmailAction = "shortlist" | "reject";
type BulkEmailTarget = {
    id: string;
    candidateFullName: string | null;
    candidateEmail: string | null;
    resumeScreeningStatus: string | null;
    job: {
        id: string;
        title: string;
        organizationId: string | null;
        organization?: { name: string | null } | null;
    } | null;
};
// POST /api/candidates/bulk-email
// Sends interview invite (shortlist) or rejection email to multiple candidates.
// Status updates (shortlist/reject/hire/not_hired) are handled separately by
// /api/candidates/bulk-action -- this route only delivers emails.
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const orgId = session.orgId;
        if (!orgId) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const [org, billing] = await Promise.all([
            prisma.organizationDetails.findUnique({ where: { id: orgId }, select: { orgStatus: true } }),
            getOrgBillingStatus(orgId),
        ]);
        const isSuspended = isOrgRestrictedStatus(org?.orgStatus);
        const quotaLocked = isInterviewQuotaLocked(billing);
        if (isSuspended || quotaLocked) {
            return NextResponse.json(
                { error: getInterviewActionBlockedMessage(isSuspended), code: isSuspended ? "ACCOUNT_SUSPENDED" : "NO_INTERVIEWS" },
                { status: isSuspended ? 403 : 402 }
            );
        }
        const { ids, action }: { ids: string[]; action: EmailAction } = await request.json();
        if (!ids?.length) {
            return NextResponse.json({ error: "ids are required" }, { status: 400 });
        }
        if (action !== "shortlist" && action !== "reject") {
            return NextResponse.json({ error: "action must be 'shortlist' or 'reject'" }, { status: 400 });
        }
        // -- Resolve applications (direct + resume-candidate indirection) ------
        const directApplications = await prisma.application.findMany({
            where: { id: { in: ids }, job: { organizationId: orgId } },
            select: {
                id: true,
                candidateFullName: true,
                candidateEmail: true,
                resumeScreeningStatus: true,
                resumeFileUrl: true,
                job: {
                    select: {
                        id: true,
                        title: true,
                        organizationId: true,
                        organization: { select: { name: true } },
                    },
                },
            },
        });
        const resolvedApplications = new Map<string, BulkEmailTarget>();
        for (const app of directApplications) {
            resolvedApplications.set(app.id, app);
        }
        if (!resolvedApplications.size) {
            return NextResponse.json({ error: "No matching candidates found" }, { status: 404 });
        }
        // Preserve original order
        const orderMap = new Map(ids.map((id, i) => [id, i]));
        const orderedApplications = [...resolvedApplications.entries()]
            .sort((a, b) => (orderMap.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b[0]) ?? Number.MAX_SAFE_INTEGER))
            .map(([, app]) => app);
        // -- Filter out apps with no email -------------------------------------
        const skipReasons: string[] = [];
        const eligible: BulkEmailTarget[] = [];
        for (const app of orderedApplications) {
            if (!app.candidateEmail) {
                skipReasons.push(`${app.candidateFullName || app.id}: Missing email address`);
                continue;
            }
            eligible.push(app);
        }
        if (!eligible.length) {
            return NextResponse.json({
                error: "No emails could be sent",
                reasons: skipReasons,
                sent: 0,
                skipped: skipReasons.length,
            }, { status: 400 });
        }
        // -- Deliver -----------------------------------------------------------
        let sent = 0;
        let queued = 0;
        const failures: Array<{ id: string; reason: string }> = [];
        if (action === "shortlist" || action === "reject") {
            // Queue via BullMQ -- respects the Resend rate limiter of 5/sec
            for (const app of eligible) {
                try {
                    await invitationDeliveryQueue.add(
                        `send-${action}-email`,
                        { applicationId: app.id, action },
                        {}
                    );
                    queued += 1;
                    await appendCandidateActivity(app.id, {
                        type: "email_sent",
                        label: action === "shortlist" ? "Interview invite queued" : "Rejection email queued",
                        details: `Queued at ${new Date().toISOString()}`,
                        timestamp: new Date().toISOString(),
                        source: "worker",
                    });
                } catch (error) {
                    const reason = error instanceof Error ? error.message : String(error);
                    console.error(`[bulk-email] queue failed for ${action}:`, { applicationId: app.id, reason });
                    failures.push({ id: app.id, reason });
                }
            }
        }
        if (sent === 0 && queued === 0) {
            return NextResponse.json({
                error: "Failed to send emails",
                sent: 0,
                queued: 0,
                skipped: skipReasons.length,
                failures,
            }, { status: 500 });
        }
        const messageParts: string[] = [];
        if (queued > 0) messageParts.push(`Queued ${queued} ${action === "shortlist" ? "interview invite" : "rejection email"}${queued !== 1 ? "s" : ""}`);
        return NextResponse.json({
            message: messageParts.join(" and ") + ".",
            sent,
            queued,
            skipped: skipReasons.length,
            reasons: skipReasons,
            failures,
        });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/candidates/bulk-email",
            method: "POST",
            error,
            body: { error: "Failed to send emails" },
            status: 500,
            logLabel: "[bulk-email] error:",
        });
    }
}
