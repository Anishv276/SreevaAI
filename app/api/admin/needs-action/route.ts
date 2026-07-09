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
                job: { orgId, isDeleted: false },
                interview: { status: "COMPLETED", isDeleted: false },
                resumeStatus: { notIn: ["SHORTLISTED", "shortlisted", "REJECTED", "rejected"] },
            },
            select: {
                id: true,
                fullName: true,
                aiScore: true,
                updatedAt: true,
                job: { select: { title: true, role: true } },
                interview: { select: { completedAt: true } },
            },
            orderBy: { updatedAt: "asc" },
        });
        const inviteNotSent = await prisma.application.findMany({
            where: {
                isDeleted: false,
                job: { orgId, isDeleted: false },
                OR: [
                    { interview: null },
                    { interview: { inviteSentAt: null, status: "PENDING", isDeleted: false } },
                ],
                resumeStatus: { notIn: ["REJECTED", "rejected"] },
            },
            select: {
                id: true,
                fullName: true,
                createdAt: true,
                job: { select: { title: true, role: true } },
            },
            orderBy: { createdAt: "asc" },
        });
        const shortlistedNoDecision = await prisma.application.findMany({
            where: {
                isDeleted: false,
                job: { orgId, isDeleted: false },
                resumeStatus: { in: ["SHORTLISTED", "shortlisted"] },
            },
            select: {
                id: true,
                fullName: true,
                updatedAt: true,
                job: { select: { title: true, role: true } },
            },
            orderBy: { updatedAt: "asc" },
        });

        const jobsExpiringSoon = await prisma.job.count({
            where: {
                orgId,
                isDeleted: false,
                deadline: {
                    gte: new Date(),
                    lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                },
            },
        });
        
        const candidatesYetToStart = await prisma.interview.count({
            where: {
                application: { job: { orgId } },
                isDeleted: false,
                status: "PENDING",
                inviteSentAt: { not: null },
            },
        });

        const invitesSentLast24h = await prisma.interview.count({
            where: {
                application: { job: { orgId } },
                isDeleted: false,
                inviteSentAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
            },
        });

        return NextResponse.json({
            awaitingReview: awaitingReview.map((a) => ({
                id: a.id,
                name: a.fullName,
                role: a.job.role || a.job.title,
                jobTitle: a.job.title,
                score: a.aiScore,
                daysWaiting: daysSince(a.interview?.completedAt ?? a.updatedAt),
            })),
            inviteNotSent: inviteNotSent.map((a) => ({
                id: a.id,
                name: a.fullName,
                role: a.job.role || a.job.title,
                jobTitle: a.job.title,
                daysWaiting: daysSince(a.createdAt),
            })),
            shortlistedNoDecision: shortlistedNoDecision.map((a) => ({
                id: a.id,
                name: a.fullName,
                role: a.job.role || a.job.title,
                jobTitle: a.job.title,
                daysWaiting: daysSince(a.updatedAt),
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
