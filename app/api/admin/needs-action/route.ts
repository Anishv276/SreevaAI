import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";
function daysSince(date: Date): number {
    return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}
export async function GET() {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const orgId = session.orgId;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // -- Needs Your Attention (action required) --------------------------

        // Interview finished, but no AI report/score has been generated yet.
        const awaitingReview = await prisma.application.findMany({
            where: {
                isDeleted: false,
                job: { organizationId: orgId, isDeleted: false },
                interview: { interviewStatus: "COMPLETED", isDeleted: false },
                resumeAiScore: null,
            },
            select: {
                id: true,
                candidateFullName: true,
                resumeAiScore: true,
                applicationUpdatedAt: true,
                job: { select: { title: true, jobRole: true } },
                interview: { select: { interviewCompletedAt: true } },
            },
            orderBy: { applicationUpdatedAt: "asc" },
        });

        // Report exists (interview completed, score present) but no shortlist/reject decision made yet.
        const shortlistedNoDecision = await prisma.application.findMany({
            where: {
                isDeleted: false,
                job: { organizationId: orgId, isDeleted: false },
                interview: { interviewStatus: "COMPLETED", isDeleted: false },
                resumeScreeningStatus: { notIn: ["SHORTLISTED", "shortlisted", "REJECTED", "rejected"] },
                resumeAiScore: { not: null },
            },
            select: {
                id: true,
                candidateFullName: true,
                applicationUpdatedAt: true,
                job: { select: { title: true, jobRole: true } },
            },
            orderBy: { applicationUpdatedAt: "asc" },
        });

        // No interview record at all, or one exists but no invite email has been sent yet.
        const inviteNotSent = await prisma.application.findMany({
            where: {
                isDeleted: false,
                job: { organizationId: orgId, isDeleted: false },
                resumeScreeningStatus: { notIn: ["REJECTED", "rejected"] },
                OR: [
                    { interview: null },
                    { interview: { inviteEmailSentAt: null, isDeleted: false } },
                ],
            },
            select: {
                id: true,
                candidateFullName: true,
                appliedAt: true,
                job: { select: { title: true, jobRole: true } },
            },
            orderBy: { appliedAt: "asc" },
        });

        const jobsExpiringSoon = await prisma.job.count({
            where: {
                organizationId: orgId,
                isDeleted: false,
                applicationDeadline: { gte: now, lte: weekEnd },
            },
        });

        // -- Upcoming Activity (forward-looking / recent) ---------------------

        const scheduledToday = await prisma.interview.count({
            where: {
                isDeleted: false,
                application: { isDeleted: false, job: { organizationId: orgId, isDeleted: false } },
                interviewScheduledAt: { gte: todayStart, lt: todayEnd },
            },
        });

        const scheduledThisWeek = await prisma.interview.count({
            where: {
                isDeleted: false,
                application: { isDeleted: false, job: { organizationId: orgId, isDeleted: false } },
                interviewScheduledAt: { gte: todayStart, lt: weekEnd },
            },
        });

        // Interviews scheduled for today that haven't happened yet.
        const remainingToday = await prisma.interview.count({
            where: {
                isDeleted: false,
                application: { isDeleted: false, job: { organizationId: orgId, isDeleted: false } },
                interviewScheduledAt: { gte: todayStart, lt: todayEnd },
                interviewStatus: { notIn: ["COMPLETED", "FAILED", "NO_SHOW"] },
            },
        });

        const completedLast24h = await prisma.interview.count({
            where: {
                isDeleted: false,
                application: { isDeleted: false, job: { organizationId: orgId, isDeleted: false } },
                interviewStatus: "COMPLETED",
                interviewCompletedAt: { gte: last24h },
            },
        });

        return NextResponse.json({
            awaitingReview: awaitingReview.map((a) => ({
                id: a.id,
                name: a.candidateFullName,
                role: a.job.jobRole || a.job.title,
                jobTitle: a.job.title,
                score: a.resumeAiScore,
                daysWaiting: daysSince(a.interview?.interviewCompletedAt ?? a.applicationUpdatedAt),
            })),
            shortlistedNoDecision: shortlistedNoDecision.map((a) => ({
                id: a.id,
                name: a.candidateFullName,
                role: a.job.jobRole || a.job.title,
                jobTitle: a.job.title,
                daysWaiting: daysSince(a.applicationUpdatedAt),
            })),
            inviteNotSent: inviteNotSent.map((a) => ({
                id: a.id,
                name: a.candidateFullName,
                role: a.job.jobRole || a.job.title,
                jobTitle: a.job.title,
                daysWaiting: daysSince(a.appliedAt),
            })),
            jobsExpiringSoon,
            upcomingActivity: {
                scheduledToday,
                scheduledThisWeek,
                remainingToday,
                completedLast24h,
            },
        }, {
            headers: { "Cache-Control": "private, max-age=60" },
        });
    } catch (error: any) {
        return apiErrorResponse({
            route: "/api/admin/needs-action",
            method: "GET",
            error,
            body: { error: "Failed to load action items" },
            status: 500,
            logLabel: "needs-action error:",
        });
    }
}
