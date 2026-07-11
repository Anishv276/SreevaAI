import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
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
        const awaitingReview = await prisma.application.findMany({
            where: {
                isDeleted: false,
                job: { organizationId: orgId, isDeleted: false },
                interview: { interviewStatus: "COMPLETED", isDeleted: false },
                resumeScreeningStatus: { notIn: ["SHORTLISTED", "shortlisted", "REJECTED", "rejected"] },
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
        const inviteNotSent = await prisma.application.findMany({
            where: {
                isDeleted: false,
                job: { organizationId: orgId, isDeleted: false },
                OR: [
                    { interview: null },
                    { interview: { inviteEmailSentAt: null, interviewStatus: "PENDING", isDeleted: false } },
                ],
                resumeScreeningStatus: { notIn: ["REJECTED", "rejected"] },
            },
            select: {
                id: true,
                candidateFullName: true,
                appliedAt: true,
                job: { select: { title: true, jobRole: true } },
            },
            orderBy: { appliedAt: "asc" },
        });
        const shortlistedNoDecision = await prisma.application.findMany({
            where: {
                isDeleted: false,
                job: { organizationId: orgId, isDeleted: false },
                resumeScreeningStatus: { in: ["SHORTLISTED", "shortlisted"] },
            },
            select: {
                id: true,
                candidateFullName: true,
                applicationUpdatedAt: true,
                job: { select: { title: true, jobRole: true } },
            },
            orderBy: { applicationUpdatedAt: "asc" },
        });

        const jobsExpiringSoon = await prisma.job.count({
            where: {
                organizationId: orgId,
                isDeleted: false,
                applicationDeadline: {
                    gte: new Date(),
                    lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                },
            },
        });

        const candidatesYetToStart = await prisma.interview.count({
            where: {
                application: { job: { organizationId: orgId } },
                isDeleted: false,
                interviewStatus: "PENDING",
                inviteEmailSentAt: { not: null },
            },
        });

        const invitesSentLast24h = await prisma.interview.count({
            where: {
                application: { job: { organizationId: orgId } },
                isDeleted: false,
                inviteEmailSentAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
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
            inviteNotSent: inviteNotSent.map((a) => ({
                id: a.id,
                name: a.candidateFullName,
                role: a.job.jobRole || a.job.title,
                jobTitle: a.job.title,
                daysWaiting: daysSince(a.appliedAt),
            })),
            shortlistedNoDecision: shortlistedNoDecision.map((a) => ({
                id: a.id,
                name: a.candidateFullName,
                role: a.job.jobRole || a.job.title,
                jobTitle: a.job.title,
                daysWaiting: daysSince(a.applicationUpdatedAt),
            })),
            upcomingActivity: {
                reportsReadyForReview: awaitingReview.length, // now full count, no take() cap
                candidatesYetToStart,
                jobsExpiringSoon,
                invitesSentLast24h,
            }
        }, {
            headers: { "Cache-Control": "private, max-age=60" },
        });
    } catch (error: any) {
        console.error("needs-action error:", error);
        return NextResponse.json({ error: "Failed to load action items" }, { status: 500 });
    }
}
