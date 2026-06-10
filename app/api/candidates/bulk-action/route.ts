import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { appendCandidateActivity } from "@/lib/candidate-activity";

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

        if (action === "shortlist") {
            await prisma.application.updateMany({
                where: { id: { in: validIds } },
                data: {
                    resumeStatus: "shortlisted",
                    interviewStatus: "pending",
                    hiringStatus: "pending",
                },
            });
            await Promise.all(validIds.map((id) => appendCandidateActivity(id, {
                type: "status_changed",
                label: "Resume shortlisted",
                details: "resume=shortlisted, interview=pending, hiring=pending",
                timestamp: new Date().toISOString(),
                source: "hr",
            })));
            return NextResponse.json({ message: `${validIds.length} candidates shortlisted` });
        }

        if (action === "not_hired" || action === "reject") {
            await prisma.application.updateMany({
                where: { id: { in: validIds } },
                data: {
                    resumeStatus: "rejected",
                    interviewStatus: "Not Qualified",
                    hiringStatus: "not hired",
                },
            });

            await Promise.all(validIds.map((id) => appendCandidateActivity(id, {
                type: "status_changed",
                label: action === "reject" ? "Resume rejected" : "Marked as not hired",
                details: `resume=rejected, interview=Not Qualified, hiring=${action === "reject" ? "Not Shortlisted" : "Not Hired"}`,
                timestamp: new Date().toISOString(),
                source: "hr",
            })));

            return NextResponse.json({ message: `${validIds.length} candidates marked as not hired` });
        }

        if (action === "hire") {
            await prisma.application.updateMany({
                where: { id: { in: validIds } },
                data: { hiringStatus: "hired", resumeStatus: "shortlisted", interviewStatus: "COMPLETED" },
            });

            await Promise.all(validIds.map((id) => appendCandidateActivity(id, {
                type: "status_changed",
                label: "Candidate hired",
                details: "resume=shortlisted, interview=COMPLETED, hiring=hired",
                timestamp: new Date().toISOString(),
                source: "hr",
            })));

            return NextResponse.json({ message: `${validIds.length} candidates hired` });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        console.error("[bulk-action] error:", error);
        return NextResponse.json({ error: "Failed to perform bulk action" }, { status: 500 });
    }
}
