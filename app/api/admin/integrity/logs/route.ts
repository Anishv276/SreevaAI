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
                    job: { orgId }
                }
            },
            select: {
                id: true,
                applicationId: true,
                status: true,
                startedAt: true,
                completedAt: true,
                integritySignals: true,
                snapshots: true,
                application: {
                    select: {
                        fullName: true,
                        email: true,
                        job: {
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
        type FormattedLog = {
            id: string;
            candidateName: string;
            candidateEmail: string;
            role: string;
            startedAt: Date | null;
            completedAt: Date | null;
            snapshots: string[];
            events: any[];
        };
        const formattedLogs = interviews.map((iv: (typeof interviews)[number]): FormattedLog => {
            const rawEvents = Array.isArray(iv.integritySignals) ? iv.integritySignals : [];
            // Re-map event types using similar logic as main integrity API
            return {
                id: iv.id,
                candidateName: iv.application.fullName,
                candidateEmail: iv.application.email,
                role: iv.application.job?.title || "N/A",
                startedAt: iv.startedAt,
                completedAt: iv.completedAt,
                snapshots: iv.snapshots,
                events: rawEvents
            };
        }).filter((log: FormattedLog) => log.events.length > 0 || log.snapshots.length > 0);
        return NextResponse.json(formattedLogs);
    } catch (error: any) {
        console.error("[INTEGRITY_LOGS_API_ERROR]", error);
        return NextResponse.json({ error: "Failed to fetch detailed logs" }, { status: 500 });
    }
}
