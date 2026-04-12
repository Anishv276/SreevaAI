import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getRangeStart } from "@/lib/date-utils";

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const orgId = session.orgId;
        const { searchParams } = new URL(req.url);
        const range = searchParams.get("range") ?? "month";
        const from = searchParams.get("from") ?? undefined;
        const start = getRangeStart(range, from);

        const now = new Date();
        const closingSoonCutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const drives = await prisma.drive.findMany({
            where: { orgId, status: { in: ["ACTIVE", "Active"] } },
            select: {
                id: true,
                title: true,
                department: true,
                workMode: true,
                deadline: true,
                screeningThreshold: true,
                applications: {
                    where: { createdAt: { gte: start } },
                    select: {
                        id: true,
                        resumeStatus: true,
                        aiScore: true,
                        interview: { select: { status: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
        });

        const result = drives.map((drive) => {
            const apps = drive.applications;

            const applied = apps.length;
            const screened = apps.filter((a) => a.aiScore != null).length;
            const interviewed = apps.filter(
                (a) => a.interview?.status === "COMPLETED"
            ).length;
            const shortlisted = apps.filter((a) =>
                ["shortlisted", "SHORTLISTED"].includes(a.resumeStatus ?? "")
            ).length;

            // Days left
            const daysLeft = drive.deadline
                ? Math.max(0, Math.ceil((new Date(drive.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
                : null;

            const isClosingSoon =
                drive.deadline != null &&
                new Date(drive.deadline) >= now &&
                new Date(drive.deadline) <= closingSoonCutoff;

            // Screening progress: screened/applied as %
            const screeningPct = applied > 0 ? Math.round((screened / applied) * 100) : 0;

            return {
                id: drive.id,
                title: drive.title,
                department: drive.department,
                workMode: drive.workMode ?? "Remote",
                deadline: drive.deadline?.toISOString() ?? null,
                daysLeft,
                isClosingSoon,
                screeningThreshold: drive.screeningThreshold ?? 60,
                screeningPct,
                applied,
                screened,
                interviewed,
                shortlisted,
            };
        });

        return NextResponse.json({ drives: result });
    } catch (error: any) {
        console.error("Drives summary error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
