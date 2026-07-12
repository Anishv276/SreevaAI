import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        const orgId = session.orgId;
        
        const interviews = await prisma.interview.findMany({
            where: {
                application: {
                    job: {
                        organizationId: orgId
                    }
                },
                OR: [
                    { interviewStartedAt: { not: null } },
                    { interviewCompletedAt: { not: null } },
                    { inviteEmailSentAt: { not: null } }
                ]
            },
            select: {
                id: true,
                interviewStatus: true,
                inviteEmailSentAt: true,
                interviewScheduledAt: true,
                interviewStartedAt: true,
                interviewCompletedAt: true,
                durationInSeconds: true,
                application: {
                    select: {
                        id: true,
                        candidateFullName: true,
                        resumeFileUrl: true,
                        resumeAiScore: true,
                        job: {
                            select: {
                                id: true,
                                title: true,
                                jobRole: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                interviewUpdatedAt: "desc"
            }
        });

        const events = interviews.map((iv) => {
            // Determine start and end times
            const start = iv.interviewStartedAt || iv.interviewScheduledAt || iv.inviteEmailSentAt || new Date();
            const durationMinutes = iv.durationInSeconds ? Math.round(iv.durationInSeconds / 60) : 30; // default to 30 mins
            let end = iv.interviewCompletedAt;
            if (!end) {
                end = new Date(start.getTime() + durationMinutes * 60000);
            }

            return {
                id: iv.id,
                title: `${iv.application.candidateFullName} - ${iv.application.job?.title || "Interview"}`,
                start,
                end,
                status: iv.interviewStatus,
                candidate: {
                    id: iv.application.id,
                    name: iv.application.candidateFullName,
                    role: iv.application.job?.jobRole || iv.application.job?.title,
                    jobId: iv.application.job?.id,
                    score: iv.application.resumeAiScore,
                    resumeUrl: iv.application.resumeFileUrl
                }
            };
        });

        return NextResponse.json({ events });
    } catch (error: unknown) {
        return apiErrorResponse({
            route: "/api/admin/schedule",
            method: "GET",
            error,
            body: { error: "Failed to fetch schedule" },
            status: 500,
            logLabel: "Schedule API error:",
        });
    }
}
