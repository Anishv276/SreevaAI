import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const range = searchParams.get("range") || "all";

        // Calculate date filter based on range
        let dateFilter = {};
        const now = new Date();
        if (range === "today") {
            dateFilter = { gte: new Date(now.setHours(0, 0, 0, 0)) };
        } else if (range === "week") {
            const lastWeek = new Date();
            lastWeek.setDate(now.getDate() - 7);
            dateFilter = { gte: lastWeek };
        } else if (range === "month") {
            const lastMonth = new Date();
            lastMonth.setMonth(now.getMonth() - 1);
            dateFilter = { gte: lastMonth };
        }

        // Fetch interviews with proctoring events
        // Note: Application model has fullName and drive relation. 
        // Interview has application relation and proctoringEvents/snapshots.
        const interviews = await prisma.interview.findMany({
            where: {
                application: {
                    drive: {
                        orgId: session.orgId
                    }
                },
                proctoringEvents: {
                    not: null
                },
                ...(Object.keys(dateFilter).length > 0 ? { startedAt: dateFilter } : {})
            },
            select: {
                id: true,
                proctoringEvents: true,
                snapshots: true,
                startedAt: true,
                application: {
                    select: {
                        fullName: true,
                        drive: {
                            select: {
                                title: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                startedAt: "desc"
            }
        });

        // Format response
        const logs = interviews.map(intv => {
            let signals = [];
            try {
                const raw = intv.proctoringEvents;
                signals = Array.isArray(raw) ? raw : JSON.parse(raw as string);
            } catch {
                signals = [];
            }

            // Calculate a basic "integrity status" for the log list
            const hasHighSeverity = signals.some((s: any) => s.severity?.toLowerCase() === "high");
            const integrityScore = hasHighSeverity ? 20 : 85; // Placeholder or simplified logic

            return {
                id: intv.id,
                candidateName: intv.application?.fullName || "Unknown",
                role: intv.application?.drive?.title || "Unknown",
                startedAt: intv.startedAt,
                integrityScore: integrityScore,
                signals: signals,
                snapshots: Array.isArray(intv.snapshots) 
                    ? intv.snapshots 
                    : typeof intv.snapshots === 'string'
                        ? JSON.parse(intv.snapshots)
                        : []
            };
        });

        return NextResponse.json(logs);
    } catch (error) {
        console.error("[INTEGRITY_LOGS_GET]", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
