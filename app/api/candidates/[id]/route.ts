import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendApplicationStatusEmail } from "@/lib/mail";
import { deleteCandidateEmbeddings } from "@/lib/pinecone";
import { deleteUrlTargets } from "@/lib/delete-utils";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const { id } = await params;
        const targetOrgId = searchParams.get("orgId") || session.orgId;

        const candidate = await prisma.application.findFirst({
            where: {
                id,
                ...(session.role !== "SUPER_ADMIN" ? { drive: { orgId: targetOrgId } } : (targetOrgId ? { drive: { orgId: targetOrgId } } : {}))
            },
            include: {
                drive: {
                    select: {
                        title: true,
                        department: true,
                        type: true,
                        orgId: true,
                        extractedDetails: true
                    }
                },
                interview: true
            }
        });

        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
        }

        const interviewReportRows = await prisma.$queryRaw<Array<{ interviewReport: unknown; strategicVerdict: unknown }>>`
            SELECT "interviewReport", "strategicVerdict"
            FROM "Interview"
            WHERE "applicationId" = ${id}
            LIMIT 1
        `;
        const interviewReport = interviewReportRows?.[0]?.interviewReport ?? null;
        const strategicVerdict = interviewReportRows?.[0]?.strategicVerdict ?? null;
        const interview = candidate.interview
            ? { ...(candidate.interview as any), interviewReport, strategicVerdict }
            : candidate.interview;

        return NextResponse.json({
            ...candidate,
            interview,
            formattedDate: new Date(candidate.createdAt).toLocaleDateString(),
            driveTitle: candidate.drive?.title || "Role N/A"
        });

    } catch (error) {
        console.error("Error fetching candidate:", error);
        return NextResponse.json({ error: "Failed to fetch candidate" }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { id } = await params;
        const orgId = (new URL(request.url).searchParams.get("orgId") || session?.orgId);

        // ── SECURITY & FETCH: Ensure candidate belongs to the Org ──────
        const candidate = await prisma.application.findFirst({
            where: { 
                id, 
                drive: { orgId } 
            },
            select: { 
                id: true,
                resumeUrl: true,
                passportUrl: true,
                interview: {
                    select: {
                        interviewRecordingUrl: true,
                        snapshots: true
                    }
                }
            }
        });

        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found or unauthorized" }, { status: 404 });
        }

        // ── STORAGE CLEANUP: Purge Resume from R2 ──────────
        try {
            const urls: string[] = [];
            if (candidate.resumeUrl) urls.push(candidate.resumeUrl);
            if (candidate.passportUrl) urls.push(candidate.passportUrl);
            if (candidate.interview?.interviewRecordingUrl) urls.push(candidate.interview.interviewRecordingUrl);
            if (candidate.interview?.snapshots?.length) urls.push(...candidate.interview.snapshots);
            await deleteUrlTargets(urls);
        } catch (storageErr) {
            console.error("[DELETE_SINGLE_CANDIDATE_STORAGE_ERROR]:", storageErr);
        }

        // ── VECTOR DB CLEANUP: Purge from Pinecone ──────────
        try {
            await deleteCandidateEmbeddings(id);
        } catch (pineconeErr) {
             console.error("[DELETE_SINGLE_CANDIDATE_PINECONE_ERROR]:", pineconeErr);
        }

        // ── DATABASE DELETION ─────────────────────────────
        await prisma.$transaction(async (tx) => {
            await tx.interview.deleteMany({
                where: { applicationId: id }
            });
            await tx.application.delete({
                where: { id }
            });
        });

        return NextResponse.json({ message: "Candidate deleted successfully" });
    } catch (error) {
        console.error("Error deleting candidate:", error);
        return NextResponse.json({ error: "Failed to delete candidate" }, { status: 500 });
    }
}
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const orgId = searchParams.get("orgId") || session?.orgId;
        const body = await request.json();

        // ── SECURITY: Verify ownership ─────────────────────
        const candidate = await prisma.application.findFirst({
            where: { id, drive: { orgId } }
        });

        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found or unauthorized" }, { status: 404 });
        }

        // ── UPDATE ─────────────────────────────────────────
        const dataToUpdate: any = {
            ...(body.resumeStatus !== undefined && { resumeStatus: body.resumeStatus }),
            ...(body.interviewStatus !== undefined && { interviewStatus: body.interviewStatus }),
            ...(body.hiringStatus !== undefined && { hiringStatus: body.hiringStatus }),
        };

        if (body.resumeStatus === "rejected" || body.resumeStatus === "REJECTED") {
            dataToUpdate.interviewStatus = "Not Qualified";
            dataToUpdate.hiringStatus = "Not Shortlisted";
        }

        const updated = await prisma.application.update({
            where: { id },
            data: dataToUpdate,
            include: { drive: { select: { title: true, orgId: true } } },
        });

        // Send email for hire / not-hired actions
        if (body.hiringStatus === "hired") {
            sendApplicationStatusEmail({
                email: updated.email,
                fullName: updated.fullName,
                jobTitle: (updated as any).drive?.title || "the role",
                orgId: (updated as any).drive?.orgId ?? undefined,
                status: "Hired",
                score: updated.aiScore || 0,
            }).catch(() => {});

            try {
                const driveStats = await prisma.drive.findUnique({
                    where: { id: candidate.driveId },
                    include: {
                        _count: {
                            select: { applications: { where: { hiringStatus: { equals: "hired", mode: "insensitive" } } } }
                        }
                    }
                });

                if (driveStats && driveStats.positions && driveStats._count.applications >= driveStats.positions) {
                    await prisma.drive.update({
                        where: { id: candidate.driveId },
                        data: { status: "CLOSED" }
                    });
                }
            } catch (err) {
                console.error("Auto-close drive error:", err);
            }
        } else if (body.hiringStatus === "not hired") {
            sendApplicationStatusEmail({
                email: updated.email,
                fullName: updated.fullName,
                jobTitle: (updated as any).drive?.title || "the role",
                orgId: (updated as any).drive?.orgId ?? undefined,
                status: "REJECTED",
                score: updated.aiScore || 0,
            }).catch(() => {});
        }

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating candidate:", error);
        return NextResponse.json({ error: "Failed to update candidate" }, { status: 500 });
    }
}
