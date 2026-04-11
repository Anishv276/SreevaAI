import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendApplicationStatusEmail } from "@/lib/mail";

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const orgId = session.orgId;
        if (!orgId) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { ids, action }: { ids: string[]; action: "hire" | "reject" | "delete" } = await request.json();

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
                drive: { select: { title: true, orgId: true, slug: true } },
            },
        });

        if (!applications.length) {
            return NextResponse.json({ error: "No matching candidates found" }, { status: 404 });
        }

        const validIds = applications.map(a => a.id);

        if (action === "delete") {
            // Clean up storage
            try {
                const { deleteObject, getKeyFromUrl } = await import("@/lib/s3");
                const bucket = process.env.R2_RESUMES_BUCKET || "resumes";
                for (const app of applications) {
                    if (app.resumeUrl) {
                        const key = getKeyFromUrl(app.resumeUrl);
                        if (key) await deleteObject(bucket, key).catch(() => {});
                    }
                }
            } catch {}

            await prisma.application.deleteMany({ where: { id: { in: validIds } } });
            return NextResponse.json({ message: `${validIds.length} candidates deleted` });
        }

        if (action === "hire" || action === "reject") {
            const emailStatus = action === "hire" ? "Hired" : "REJECTED";

            if (action === "hire") {
                await prisma.application.updateMany({
                    where: { id: { in: validIds } },
                    data: { hiringStatus: "hired", resumeStatus: "shortlisted", interviewStatus: "finished" },
                });
            } else {
                await prisma.application.updateMany({
                    where: { id: { in: validIds } },
                    data: { 
                        resumeStatus: "rejected",
                        interviewStatus: "Not Qualified",
                        hiringStatus: "Not Shortlisted"
                    },
                });
            }

            // Send emails in parallel (fire and forget — don't block response)
            const careersUrl = process.env.NEXT_PUBLIC_APP_URL
                ? `${process.env.NEXT_PUBLIC_APP_URL}/careers`
                : "https://lumoscale.co/careers";

            Promise.allSettled(
                applications.map(app =>
                    sendApplicationStatusEmail({
                        email: app.email,
                        fullName: app.fullName,
                        jobTitle: app.drive.title,
                        orgId: app.drive.orgId ?? undefined,
                        status: emailStatus as any,
                        score: 0,
                        ...(action === "reject" ? { interviewLink: careersUrl } : {}),
                    })
                )
            ).catch(() => {});

            return NextResponse.json({ message: `${validIds.length} candidates ${action.toLowerCase()}` });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        console.error("[bulk-action] error:", error);
        return NextResponse.json({ error: "Failed to perform bulk action" }, { status: 500 });
    }
}
