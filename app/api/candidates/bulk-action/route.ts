import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendApplicationStatusEmail } from "@/lib/mail";
import { generateId } from "@/lib/ids";
import { isInterviewTokenRequired } from "@/lib/interview-access";

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const orgId = session.orgId;
        if (!orgId) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { ids, action }: { ids: string[]; action: "hire" | "reject" | "delete" | "shortlist" | "not_hired" } = await request.json();

        if (!ids?.length || !action) {
            return NextResponse.json({ error: "ids and action are required" }, { status: 400 });
        }

        // Security: only operate on applications belonging to this org
        const applications = await prisma.application.findMany({
            where: { id: { in: ids }, drive: { orgId } },
            select: {
                id: true,
                fullName: true,
                email: true,
                resumeUrl: true,
                drive: { select: { id: true, title: true, orgId: true } },
            },
        });

        if (!applications.length) {
            return NextResponse.json({ error: "No matching candidates found" }, { status: 404 });
        }

        const validIds = applications.map((a: (typeof applications)[number]) => a.id);

        if (action === "delete") {
            // Clean up storage
            try {
                const { deleteObject, getKeyFromUrl } = await import("@/lib/s3");
                const bucket = process.env.R2_RESUMES_BUCKET || "resumes";
                for (const app of applications) {
                    if (app.resumeUrl) {
                        const key = getKeyFromUrl(app.resumeUrl);
                        if (key) await deleteObject(bucket, key).catch((err) => console.error("[BULK_DELETE_OBJ_ERROR]:", err));
                    }
                }
            } catch (err) {
                console.error("[BULK_DELETE_STORAGE_ERROR]:", err);
            }

            await prisma.application.deleteMany({ where: { id: { in: validIds } } });
            return NextResponse.json({ message: `${validIds.length} candidates deleted` });
        }

        const careersUrl = process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL}/careers`
            : "https://sreeva.ai/careers";

        if (action === "shortlist") {
            // Shortlist: set resumeStatus to shortlisted, create interview invites, send emails
            await prisma.application.updateMany({
                where: { id: { in: validIds } },
                data: { resumeStatus: "shortlisted" },
            });

            // Create interview records and send emails
            await Promise.allSettled(applications.map(async (app: (typeof applications)[number]) => {
                const interview = await (prisma as any).interview.upsert({
                    where: { applicationId: app.id },
                    update: { expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), status: "PENDING" },
                    create: {
                        id: generateId("int", app.fullName || app.id),
                        applicationId: app.id,
                        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
                        status: "PENDING",
                    },
                });
                const interviewBase = `${process.env.NEXT_PUBLIC_APP_URL || "https://sreevaai.com"}/interview/${app.id}`;
                const interviewLink = isInterviewTokenRequired()
                    ? `${interviewBase}?token=${interview.accessToken}`
                    : interviewBase;
                return sendApplicationStatusEmail({
                    email: app.email,
                    fullName: app.fullName,
                    jobTitle: app.drive.title,
                    orgId: app.drive.orgId ?? undefined,
                    status: "SHORTLISTED",
                    score: 0,
                    interviewLink,
                });
            }));

            return NextResponse.json({ message: `${validIds.length} candidates shortlisted` });
        }

        if (action === "not_hired" || action === "reject") {
            await prisma.application.updateMany({
                where: { id: { in: validIds } },
                data: {
                    resumeStatus: "rejected",
                    interviewStatus: "Not Qualified",
                    hiringStatus: "Not Shortlisted",
                },
            });

            Promise.allSettled(
                applications.map((app: (typeof applications)[number]) =>
                    sendApplicationStatusEmail({
                        email: app.email,
                        fullName: app.fullName,
                        jobTitle: app.drive.title,
                        orgId: app.drive.orgId ?? undefined,
                        status: "REJECTED",
                        score: 0,
                        interviewLink: careersUrl,
                    })
                )
            ).catch(err => {
                console.error("[BULK_REJECT_EMAIL_ERROR]:", err);
            });

            return NextResponse.json({ message: `${validIds.length} candidates marked as not hired` });
        }

        if (action === "hire") {
            await prisma.application.updateMany({
                where: { id: { in: validIds } },
                data: { hiringStatus: "hired", resumeStatus: "shortlisted", interviewStatus: "finished" },
            });

            Promise.allSettled(
                applications.map((app: (typeof applications)[number]) =>
                    sendApplicationStatusEmail({
                        email: app.email,
                        fullName: app.fullName,
                        jobTitle: app.drive.title,
                        orgId: app.drive.orgId ?? undefined,
                        status: "Hired",
                        score: 0,
                    })
                )
            ).catch(err => {
                console.error("[BULK_HIRE_EMAIL_ERROR]:", err);
            });

            try {
                const driveIds = [...new Set(applications.map((a: (typeof applications)[number]) => a.drive.id))];
                for (const dId of driveIds) {
                    const driveStats = await prisma.drive.findUnique({
                        where: { id: dId },
                        include: {
                            _count: { select: { applications: { where: { hiringStatus: { equals: "hired", mode: "insensitive" } } } } }
                        }
                    });
                    if (driveStats && driveStats.positions && driveStats._count.applications >= driveStats.positions) {
                        await prisma.drive.update({
                            where: { id: dId },
                            data: { status: "CLOSED" }
                        });
                    }
                }
            } catch (err) {
                console.error("Auto-close bulk drive error:", err);
            }

            return NextResponse.json({ message: `${validIds.length} candidates hired` });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        console.error("[bulk-action] error:", error);
        return NextResponse.json({ error: "Failed to perform bulk action" }, { status: 500 });
    }
}
