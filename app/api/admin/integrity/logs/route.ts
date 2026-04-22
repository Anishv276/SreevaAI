import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const orgId = session.orgId;
        const { searchParams } = new URL(req.url);
        const range = searchParams.get("range") ?? "month";
        const from = searchParams.get("from") ?? undefined;
        const to = searchParams.get("to") ?? undefined;

        let startTime = new Date(0);
        const now = new Date();

        if (range === "today") startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        else if (range === "week") {
            startTime = new Date(now);
            startTime.setDate(now.getDate() - 7);
        } else if (range === "month") {
            startTime = new Date(now);
            startTime.setMonth(now.getMonth() - 1);
        } else if (range === "custom" && from) {
            startTime = new Date(from);
        }

        const interviews = await prisma.interview.findMany({
            where: {
                status: "COMPLETED",
                completedAt: { gte: startTime },
                application: {
                    drive: { orgId }
                }
            },
            select: {
                id: true,
                applicationId: true,
                status: true,
                startedAt: true,
                completedAt: true,
                proctoringEvents: true,
                snapshots: true,
                application: {
                    select: {
                        fullName: true,
                        email: true,
                        drive: {
                            select: {
                                title: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                completedAt: "desc"
            }
        });

        // Filter and format for the audit log
        const formattedLogs = interviews.map((iv: (typeof interviews)[number]) => {
            const rawEvents = iv.proctoringEvents as any[] || [];

            // Re-map event types using similar logic as main integrity API
            return {
                id: iv.id,
                candidateName: iv.application.fullName,
                candidateEmail: iv.application.email,
                role: iv.application.drive?.title || "N/A",
                startedAt: iv.startedAt,
                completedAt: iv.completedAt,
                snapshots: iv.snapshots,
                events: rawEvents
            };
        }).filter((log: (typeof interviews)[number] & { events: any[] }) => log.events.length > 0 || log.snapshots.length > 0);
        return NextResponse.json(formattedLogs);
    } catch (error: any) {
        console.error("[INTEGRITY_LOGS_API_ERROR]", error);
        return NextResponse.json({ error: "Failed to fetch detailed logs" }, { status: 500 });
    }
}
