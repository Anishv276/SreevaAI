import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { updateCandidateStatusSchema } from "@/lib/validation";
import { deleteUrlTargets } from "@/lib/delete-utils";
import { appendCandidateActivity } from "@/lib/candidate-activity";
import { getRecordingDurationSec, getRecordingMimeType, getRecordingUrl } from "@/lib/recording-state";
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { id } = await params;
        // -- TENANT ISOLATION: enforce org ownership in the DB query itself.
        // Non-SUPER_ADMINs are scoped to their own org; a SUPER_ADMIN sees any.
        // Doing this in the WHERE clause (not a post-fetch JS check) closes the
        // null-orgId bypass where an orphaned job made the check short-circuit.
        const orgScope =
            session.role === "SUPER_ADMIN"
                ? { id }
                : { id, job: { organizationId: session.orgId ?? "__none__" } };
        const candidate = await prisma.application.findFirst({
            where: orgScope,
            select: {
                id: true,
                candidateFullName: true,
                candidateEmail: true,
                candidatePhone: true,
                resumeFileUrl: true,
                resumeAiScore: true,
                resumeAiReport: true,
                resumeFullScanReport: true,
                resumeRawText: true,
                resumeParsedData: true,
                resumeScreeningStatus: true,
                interviewPhaseStatus: true,
                appliedAt: true,
                applicationUpdatedAt: true,
                job: {
                    select: {
                        title: true,
                        organizationId: true,
                        jobRole: true,
                        jdExtractedDetails: true,
                    }
                },
                interview: {
                    select: {
                        id: true,
                        applicationId: true,
                        interviewStatus: true,
                        interviewStartedAt: true,
                        interviewCompletedAt: true,
                        fullTranscript: true,
                        durationInSeconds: true,
                        aiInterviewSummary: true,
                        candidateFeedbackText: true,
                        candidateSelfRating: true,
                        interviewCreatedAt: true,
                        interviewUpdatedAt: true,
                        inviteEmailSentAt: true,
                        aiSkillRatings: true,
                        aiScoreBreakdown: true,
                        proctoringAnalysis: true,
                        perQuestionAnalysis: true,
                        proctoringEvents: true,
                        sessionRecording: true,
                        proctoringSnapshotUrls: true,
                    }
                }
            }
        });
        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
        }
        const interview = candidate.interview
            ? {
                  ...candidate.interview,
                  ...(candidate.interview.sessionRecording
                      ? {
                            interviewRecordingUrl: getRecordingUrl(candidate.interview.sessionRecording),
                            recordingDurationSec: getRecordingDurationSec(candidate.interview.sessionRecording),
                            recordingMimeType: getRecordingMimeType(candidate.interview.sessionRecording),
                        }
                      : {}),
              }
            : null;
        // Org ownership is now enforced by the findFirst WHERE clause above, so a
        // returned candidate is guaranteed to belong to the caller's org (or the
        // caller is a SUPER_ADMIN). No post-fetch check needed.
        return NextResponse.json({
            ...candidate,
            interview,
            formattedDate: new Date(candidate.appliedAt).toLocaleDateString(),
            jobTitle: candidate.job?.title || "Role N/A"
        }, {
            headers: {
                // PII (email, phone, resume, scores, transcript) must not be
                // cached by the browser or any intermediary.
                'Cache-Control': 'private, no-store',
            }
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
        // -- TENANT ISOLATION: only a SUPER_ADMIN may target another org via the
        // query string. A regular admin is always scoped to their own session org,
        // otherwise any admin could pass ?orgId=<victim_org> and delete across tenants.
        const orgId =
            session.role === "SUPER_ADMIN"
                ? (new URL(request.url).searchParams.get("orgId") || session.orgId)
                : session.orgId;
        // -- SECURITY & FETCH: Ensure candidate belongs to the Org ------
        const candidate = await prisma.application.findFirst({
            where: {
                id,
                job: { organizationId: orgId }
            },
            select: {
                id: true,
                resumeFileUrl: true,
                interview: {
                    select: {
                        sessionRecording: true,
                        proctoringSnapshotUrls: true
                    }
                }
            }
        });
        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found or unauthorized" }, { status: 404 });
        }
        // -- QUEUE CLEANUP --
        try {
            const { resumeQueue } = await import("@/lib/queue");
            const waitingResume = await resumeQueue.getJobs(['waiting', 'delayed', 'active']);
            for (const job of waitingResume) {
                if (job.data.applicationId === id) {
                    await job.remove();
                }
            }
        } catch (queueErr) {
            console.warn("[DELETE] Could not clean queue jobs:", queueErr);
        }
        // -- SOFT DELETE: DATABASE CLEANUP (Cascading) ---------------------------
        await prisma.$transaction(async (tx) => {
            // 1. Soft Delete Support Tickets
            await tx.$executeRaw`
                UPDATE "SupportTicket" SET "ticketStatus" = 'DELETED'
                WHERE "interviewId" IN (
                    SELECT "id" FROM "Interview" WHERE "applicationId" = ${id}
                )
            `;
            // 2. Delete the interview (FK constraint prevents renaming applicationId)
            await tx.$executeRaw`
                DELETE FROM "Interview" WHERE "applicationId" = ${id}
            `;
            // 3. Soft delete the application
            await tx.application.update({
                where: { id },
                data: { isDeleted: true }
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
        // -- TENANT ISOLATION: only SUPER_ADMIN may target another org via query.
        const orgId =
            session.role === "SUPER_ADMIN"
                ? (searchParams.get("orgId") || session.orgId)
                : session.orgId;
        // -- VALIDATION: allowlist of status fields + value length caps ------
        const rawBody = await request.json();
        const parsed = updateCandidateStatusSchema.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        const body = parsed.data;
        // -- SECURITY: Verify ownership ---------------------
        const candidate = await prisma.application.findFirst({
            where: { id, job: { organizationId: orgId } }
        });
        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found or unauthorized" }, { status: 404 });
        }

        const normalize = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
        const isShortlist = normalize(body.resumeScreeningStatus) === "shortlisted";
        const isRejected = normalize(body.resumeScreeningStatus) === "rejected";

        // -- UPDATE -----------------------------------------
        // Manual HR override: directly apply whatever status they select
        const dataToUpdate: any = {
            ...(body.resumeScreeningStatus !== undefined && { resumeScreeningStatus: body.resumeScreeningStatus }),
            ...(body.interviewPhaseStatus !== undefined && { interviewPhaseStatus: body.interviewPhaseStatus }),
        };
        if (isShortlist) {
            dataToUpdate.resumeScreeningStatus = "shortlisted";
            dataToUpdate.interviewPhaseStatus = "pending";
        }
        if (isRejected) {
            dataToUpdate.resumeScreeningStatus = "rejected";
            dataToUpdate.interviewPhaseStatus = "Not Qualified";
        }
        const updated = await prisma.application.update({
            where: { id },
            data: dataToUpdate,
            include: { job: { select: { title: true, organizationId: true } } },
        });
        if (isShortlist || isRejected) {
            const actionLabel = isShortlist
                ? "Resume shortlisted"
                : "Resume rejected";
            await appendCandidateActivity(id, {
                type: "status_changed",
                label: actionLabel,
                details: `resume=${updated.resumeScreeningStatus}, interview=${updated.interviewPhaseStatus}`,
                timestamp: new Date().toISOString(),
                source: "hr",
            });
        }
        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating candidate:", error);
        return NextResponse.json({ error: "Failed to update candidate" }, { status: 500 });
    }
}
