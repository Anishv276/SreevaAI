import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { normalizeEmail } from "@/lib/email";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const normalizedEmail = normalizeEmail(session.email);
        if (!normalizedEmail) {
            return NextResponse.json({ error: "Session missing email identity" }, { status: 400 });
        }

        const applications = await prisma.application.findMany({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                },
            },
            include: {
                drive: {
                    select: {
                        id: true,
                        title: true,
                    }
                },
                interview: {
                    select: {
                        id: true,
                        status: true,
                        accessToken: true,
                        expiresAt: true,
                        startedAt: true,
                        completedAt: true,
                        interviewDuration: true,
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        });

        const formattedApplications = applications.map((app) => {
            const interviewStage = app.interview
                ? {
                    status: app.interview.status,
                    token: app.interview.accessToken,
                    accessToken: app.interview.accessToken,
                    expiresAt: app.interview.expiresAt,
                    canStart:
                        app.interview.status === "PENDING" &&
                        !!app.interview.expiresAt &&
                        new Date() < new Date(app.interview.expiresAt),
                    interviewLink: isInterviewTokenRequired()
                        ? `${appUrl}/interview/${app.id}?token=${encodeURIComponent(app.interview.accessToken)}`
                        : `${appUrl}/interview/${app.id}`,
                }
                : null;

            return {
                id: app.id,
                status: app.hiringStatus,
                score: app.aiScore,
                createdAt: app.createdAt,
                drive: app.drive,
                interview: interviewStage,
            };
        });

        return NextResponse.json(formattedApplications);
    } catch (error) {
        console.error("[CANDIDATE DASHBOARD ERROR]:", error);
        return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
    }
}
