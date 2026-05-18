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

        const [awaitingReview, inviteNotSent, shortlistedNoDecision] = await Promise.all([
            // Bucket 1: interview COMPLETED, no hire/resume decision yet
            prisma.application.findMany({
                where: {
                    drive: { orgId },
                    interview: { status: "COMPLETED" },
                    hiringStatus: { in: ["pending", "PENDING"] },
                    resumeStatus: { notIn: ["SHORTLISTED", "shortlisted", "REJECTED", "rejected", "HIRED", "hired"] },
                },
                select: {
                    id: true,
                    fullName: true,
                    aiScore: true,
                    updatedAt: true,
                    drive: { select: { title: true, role: true } },
                    interview: { select: { completedAt: true } },
                },
                orderBy: { updatedAt: "asc" },
                take: 5,
            }),

            // Bucket 2: uploaded (application exists), no interview record at all OR interview never invited
            prisma.application.findMany({
                where: {
                    drive: { orgId },
                    OR: [
                        { interview: null },
                        { interview: { inviteSentAt: null, status: "PENDING" } },
                    ],
                    resumeStatus: { notIn: ["REJECTED", "rejected"] },
                    hiringStatus: { notIn: ["HIRED", "hired", "REJECTED", "rejected"] },
                },
                select: {
                    id: true,
                    fullName: true,
                    createdAt: true,
                    drive: { select: { title: true, role: true } },
                },
                orderBy: { createdAt: "asc" },
                take: 5,
            }),

            // Bucket 3: shortlisted but no hire/reject decision
            prisma.application.findMany({
                where: {
                    drive: { orgId },
                    resumeStatus: { in: ["SHORTLISTED", "shortlisted"] },
                    hiringStatus: { in: ["pending", "PENDING"] },
                },
                select: {
                    id: true,
                    fullName: true,
                    updatedAt: true,
                    drive: { select: { title: true, role: true } },
                },
                orderBy: { updatedAt: "asc" },
                take: 5,
            }),
        ]);

        return NextResponse.json({
            awaitingReview: awaitingReview.map((a) => ({
                id: a.id,
                name: a.fullName,
                role: a.drive.role || a.drive.title,
                driveTitle: a.drive.title,
                score: a.aiScore,
                daysWaiting: daysSince(a.interview?.completedAt ?? a.updatedAt),
            })),
            inviteNotSent: inviteNotSent.map((a) => ({
                id: a.id,
                name: a.fullName,
                role: a.drive.role || a.drive.title,
                driveTitle: a.drive.title,
                daysWaiting: daysSince(a.createdAt),
            })),
            shortlistedNoDecision: shortlistedNoDecision.map((a) => ({
                id: a.id,
                name: a.fullName,
                role: a.drive.role || a.drive.title,
                driveTitle: a.drive.title,
                daysWaiting: daysSince(a.updatedAt),
            })),
        }, {
            headers: { "Cache-Control": "private, max-age=60" },
        });
    } catch (error: any) {
        console.error("needs-action error:", error);
        return NextResponse.json({ error: "Failed to load action items" }, { status: 500 });
    }
}
