import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const orgId = session.orgId;
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // Top candidates this week = recently completed interviews with highest AI score
        const applications = await prisma.application.findMany({
            where: {
                drive: { orgId },
                aiScore: { not: null },
                updatedAt: { gte: weekAgo },
                interview: { status: "COMPLETED" },
            },
            select: {
                id: true,
                fullName: true,
                aiScore: true,
                resumeStatus: true,
                hiringStatus: true,
                drive: { select: { title: true, department: true, role: true } },
                interview: {
                    select: {
                        status: true,
                        application: { select: { aiScore: true } },
                    },
                },
                structuredResume: true,
            },
            orderBy: { aiScore: "desc" },
            take: 6,
        });

        const candidates = applications.map((app) => {
            // Extract resume score from structuredResume JSON if available
            let resumeScore: number | null = null;
            try {
                const sr = typeof app.structuredResume === "string"
                    ? JSON.parse(app.structuredResume)
                    : app.structuredResume;
                resumeScore = sr?.resumeScore ?? sr?.resume_score ?? null;
            } catch { /* ignore */ }

            // Derive display status
            const statusMap: Record<string, string> = {
                Shortlisted: "Shortlisted",
                SHORTLISTED: "Shortlisted",
                Hired: "Hired",
                HIRED: "Hired",
                Rejected: "Rejected",
                REJECTED: "Rejected",
                PENDING: "Pending",
            };
            const compositeStatus = app.hiringStatus !== 'pending' ? app.hiringStatus : app.resumeStatus;
            const displayStatus = statusMap[compositeStatus] ?? statusMap[compositeStatus.toUpperCase()] ?? "Reviewing";

            // Initials from name
            const initials = app.fullName
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

            return {
                id: app.id,
                name: app.fullName,
                initials,
                role: app.drive.role || app.drive.title,
                department: app.drive.department,
                driveTitle: app.drive.title,
                interviewScore: app.aiScore,
                resumeScore,
                status: displayStatus,
            };
        });

        return NextResponse.json({ candidates });
    } catch (error: any) {
        console.error("Top candidates error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
