import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { normalizeEmail } from "@/lib/email";
import { buildInterviewLink } from "@/lib/interview-links";
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
                        deadline: true,
                        organization: {
                            select: {
                                name: true,
                            },
                        },
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
                        linkStatus: true,
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        });
        const formattedApplications = applications.map((app: any) => {
            const nowMs = Date.now();
            const expiresAtMs = app.interview?.expiresAt ? new Date(app.interview.expiresAt).getTime() : null;
            const isDeadlineExpired = expiresAtMs !== null && nowMs > expiresAtMs;
            const effectiveLinkStatus = app.interview
                ? (isDeadlineExpired ? "EXPIRED" : (app.interview.linkStatus || "ACTIVE"))
                : null;
            const interviewStage = app.interview
                ? {
                    status: app.interview.status,
                    token: app.interview.accessToken,
                    accessToken: app.interview.accessToken,
                    expiresAt: app.interview.expiresAt,
                    mode: "DEADLINE",
                    linkStatus: effectiveLinkStatus,
                    canStart: (() => {
                        if (app.interview.status !== "PENDING") return false;
                        const startedAtMs = app.interview.startedAt ? new Date(app.interview.startedAt).getTime() : null;
                        const deadlineOpen = !isDeadlineExpired;
                        const withinRejoinWindow = startedAtMs === null || nowMs <= startedAtMs + 5 * 60 * 1000;
                        return deadlineOpen && withinRejoinWindow;
                    })(),
                    interviewLink: buildInterviewLink(appUrl, app.id, {
                        token: isInterviewTokenRequired() ? app.interview.accessToken : null,
                        orgName: app.drive?.organization?.name || "Sreeva AI",
                    }),
                }
                : null;
            return {
                id: app.id,
                status: app.resumeStatus,
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
