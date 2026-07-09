import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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
                        orgId: orgId
                    }
                },
                OR: [
                    { startedAt: { not: null } },
                    { completedAt: { not: null } },
                    { inviteSentAt: { not: null } }
                ]
            },
            select: {
                id: true,
                status: true,
                inviteSentAt: true,
                scheduledAt: true,
                startedAt: true,
                completedAt: true,
                interviewDuration: true,
                application: {
                    select: {
                        id: true,
                        fullName: true,
                        resumeUrl: true,
                        aiScore: true,
                        job: {
                            select: {
                                id: true,
                                title: true,
                                role: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                updatedAt: "desc"
            }
        });

        const events = interviews.map((iv) => {
            // Determine start and end times
            const start = iv.startedAt || iv.scheduledAt || iv.inviteSentAt || new Date();
            const durationMinutes = iv.interviewDuration || 30; // default to 30 mins
            let end = iv.completedAt;
            if (!end) {
                end = new Date(start.getTime() + durationMinutes * 60000);
            }

            return {
                id: iv.id,
                title: `${iv.application.fullName} - ${iv.application.job?.title || "Interview"}`,
                start,
                end,
                status: iv.status,
                candidate: {
                    id: iv.application.id,
                    name: iv.application.fullName,
                    role: iv.application.job?.role || iv.application.job?.title,
                    jobId: iv.application.job?.id,
                    score: iv.application.aiScore,
                    resumeUrl: iv.application.resumeUrl
                }
            };
        });

        return NextResponse.json({ events });
    } catch (error: unknown) {
        console.error("Schedule API error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to fetch schedule" },
            { status: 500 }
        );
    }
}
