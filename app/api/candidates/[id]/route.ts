import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendApplicationStatusEmail } from "@/lib/mail";
import { deleteCandidateEmbeddings } from "@/lib/pinecone";
import { deleteUrlTargets } from "@/lib/delete-utils";
import { appendCandidateActivity } from "@/lib/candidate-activity";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { id } = await params;
        const candidate = await prisma.application.findUnique({
            where: { id },
            select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
                resumeUrl: true,
                aiScore: true,
                aiReport: true,
                resumeText: true,
                resumeData: true,
                resumeStatus: true,
                interviewStatus: true,
                hiringStatus: true,
                createdAt: true,
                updatedAt: true,
                drive: {
                    select: {
                        title: true,
                        department: true,
                        orgId: true,
                        role: true,
                        extractedDetails: true,
                    }
                },
                interview: {
                    select: {
                        id: true,
                        applicationId: true,
                        status: true,
                        startedAt: true,
                        completedAt: true,
                        interviewRecordingUrl: true,
                        interviewTranscript: true,
                        interviewRecordedAt: true,
                        interviewDuration: true,
                        aiSummary: true,
                        candidateFeedback: true,
                        candidateRating: true,
                        createdAt: true,
                        updatedAt: true,
                        inviteSentAt: true,
                        proctoringEvents: true,
                        interviewReport: true,
                        proctoringReport: true,
                        strategicVerdict: true,
                        interviewTurns: true,
                        answerScores: true,
                        recordingStatus: true,
                        recordingMimeType: true,
                        recordingStartedAt: true,
                        recordingCompletedAt: true,
                        recordingDurationSec: true,
                        recordingManifest: true,
                        snapshots: true,
                        billingSnapshot: true,
                    }
                }
            }
        });

        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
        }

        const candidateOrgId = candidate.drive?.orgId || null;
        if (session.role !== "SUPER_ADMIN" && session.orgId && candidateOrgId && candidateOrgId !== session.orgId) {
            return NextResponse.json({ error: "Candidate belongs to a different organization" }, { status: 403 });
        }

        return NextResponse.json({
            ...candidate,
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

        // -- SECURITY & FETCH: Ensure candidate belongs to the Org ------
        const candidate = await prisma.application.findFirst({
            where: {
                id,
                drive: { orgId }
            },
            select: {
                id: true,
                resumeUrl: true,
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

        // -- STORAGE CLEANUP: Purge Resume from R2 ----------
        try {
            const urls: string[] = [];
            if (candidate.resumeUrl) urls.push(candidate.resumeUrl);
            if (candidate.interview?.interviewRecordingUrl) urls.push(candidate.interview.interviewRecordingUrl);
            if (candidate.interview?.snapshots?.length) urls.push(...candidate.interview.snapshots);
            await deleteUrlTargets(urls);
        } catch (storageErr) {
            console.error("[DELETE_SINGLE_CANDIDATE_STORAGE_ERROR]:", storageErr);
        }

        // -- VECTOR DB CLEANUP: Purge from Pinecone ----------
        try {
            await deleteCandidateEmbeddings(id);
        } catch (pineconeErr) {
            console.error("[DELETE_SINGLE_CANDIDATE_PINECONE_ERROR]:", pineconeErr);
        }

        // -- DATABASE DELETION -----------------------------
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

        // -- SECURITY: Verify ownership ---------------------
        const candidate = await prisma.application.findFirst({
            where: { id, drive: { orgId } }
        });

        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found or unauthorized" }, { status: 404 });
        }

        const normalize = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
        const isShortlist = normalize(body.resumeStatus) === "shortlisted";
        const isRejected = normalize(body.resumeStatus) === "rejected";
        const isHired = normalize(body.hiringStatus) === "hired";
        const isNotHired = normalize(body.hiringStatus) === "not hired" || normalize(body.hiringStatus) === "not shortlisted";

        // -- UPDATE -----------------------------------------
        const dataToUpdate: any = {
            ...(body.resumeStatus !== undefined && { resumeStatus: body.resumeStatus }),
            ...(body.interviewStatus !== undefined && { interviewStatus: body.interviewStatus }),
            ...(body.hiringStatus !== undefined && { hiringStatus: body.hiringStatus }),
        };

        if (isShortlist) {
            dataToUpdate.resumeStatus = "shortlisted";
            dataToUpdate.interviewStatus = "pending";
            dataToUpdate.hiringStatus = "pending";
        }

        if (isRejected) {
            dataToUpdate.resumeStatus = "rejected";
            dataToUpdate.interviewStatus = "not qualified";
            dataToUpdate.hiringStatus = "not hired";
        }

        if (isHired) {
            dataToUpdate.resumeStatus = "shortlisted";
            dataToUpdate.interviewStatus = "finished";
            dataToUpdate.hiringStatus = "hired";
        }

        if (isNotHired) {
            dataToUpdate.resumeStatus = "rejected";
            dataToUpdate.interviewStatus = "not qualified";
            dataToUpdate.hiringStatus = "not hired";
        }

        const updated = await prisma.application.update({
            where: { id },
            data: dataToUpdate,
            include: { drive: { select: { title: true, orgId: true } } },
        });

        if (isShortlist || isRejected || isHired || isNotHired) {
            const actionLabel = isShortlist
                ? "Resume shortlisted"
                : isRejected
                    ? "Resume rejected"
                    : isHired
                        ? "Candidate hired"
                        : "Marked as not hired";
            await appendCandidateActivity(id, {
                type: "status_changed",
                label: actionLabel,
                details: `resume=${updated.resumeStatus}, interview=${updated.interviewStatus}, hiring=${updated.hiringStatus}`,
                timestamp: new Date().toISOString(),
                source: "hr",
            });
        }

        // Send email for hire / not-hired actions
        if (body.hiringStatus === "hired") {
            const mailResult = await sendApplicationStatusEmail({
                email: updated.email,
                fullName: updated.fullName,
                jobTitle: (updated as any).drive?.title || "the role",
                orgId: (updated as any).drive?.orgId ?? undefined,
                status: "Hired",
                score: updated.aiScore || 0,
            });
            if (mailResult.success) {
                await appendCandidateActivity(id, {
                    type: "email_sent",
                    label: "Hire email sent",
                    details: `Sent at ${new Date().toISOString()}`,
                    timestamp: new Date().toISOString(),
                    source: "system",
                });
            }

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
            const mailResult = await sendApplicationStatusEmail({
                email: updated.email,
                fullName: updated.fullName,
                jobTitle: (updated as any).drive?.title || "the role",
                orgId: (updated as any).drive?.orgId ?? undefined,
                status: "REJECTED",
                score: updated.aiScore || 0,
            });
            if (mailResult.success) {
                await appendCandidateActivity(id, {
                    type: "email_sent",
                    label: "Rejection email sent",
                    details: `Sent at ${new Date().toISOString()}`,
                    timestamp: new Date().toISOString(),
                    source: "system",
                });
            }
        }

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating candidate:", error);
        return NextResponse.json({ error: "Failed to update candidate" }, { status: 500 });
    }
}
