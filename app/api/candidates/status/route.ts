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
                candidateEmail: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                },
            },
            include: {
                job: {
                    select: {
                        id: true,
                        title: true,
                        applicationDeadline: true,
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
                        interviewStatus: true,
                        candidateInviteToken: true,
                        inviteLinkExpiresAt: true,
                        interviewStartedAt: true,
                        interviewCompletedAt: true,
                        durationInSeconds: true,
                    }
                }
            },
            orderBy: { appliedAt: "desc" }
        });
        const formattedApplications = applications.map((app: any) => {
            const interviewStage = app.interview
                ? {
                    interviewStatus: app.interview.interviewStatus,
                    candidateInviteToken: app.interview.candidateInviteToken,
                    inviteLinkExpiresAt: app.interview.inviteLinkExpiresAt,
                    mode: "DEADLINE",
                    canStart: (() => {
                        if (!["PENDING", "SCHEDULED"].includes(app.interview.interviewStatus)) return false;
                        const startedAtMs = app.interview.interviewStartedAt ? new Date(app.interview.interviewStartedAt).getTime() : null;
                        const nowMs = Date.now();
                        const withinRejoinWindow = startedAtMs === null || nowMs <= startedAtMs + 5 * 60 * 1000;
                        return withinRejoinWindow;
                    })(),
                    interviewLink: buildInterviewLink(appUrl, app.id, {
                        token: isInterviewTokenRequired() ? app.interview.candidateInviteToken : null,
                    }),
                }
                : null;
            return {
                id: app.id,
                status: app.resumeScreeningStatus,
                score: app.resumeAiScore,
                createdAt: app.appliedAt,
                job: app.job,
                interview: interviewStage,
            };
        });
        return NextResponse.json(formattedApplications);
    } catch (error) {
        console.error("[CANDIDATE DASHBOARD ERROR]:", error);
        return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
    }
}
