import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateJobSchema } from "@/lib/validation";
import { deleteUrlTargets } from "@/lib/delete-utils";
import { getRecordingUrl } from "@/lib/recording-state";
import { normalizeJobAiConfig } from "@/lib/ai-provider-config";
import { safeJsonParse } from "@/lib/utils";
import { getSession } from "@/lib/auth";
import { parseJobScreeningSettings, sanitizeScreeningCriteria } from "@/lib/screening-criteria";
import { isOrgRestrictedStatus } from "@/lib/interview-quota";
import { apiErrorResponse } from "@/lib/slack-error-logger";
function normalizeDeadlineDate(deadline?: string | null) {
    if (!deadline) return null;
    const parsed = new Date(`${deadline}T23:59:59.999`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}
export const dynamic = "force-dynamic";
/**
 * GET handler to fetch the metadata for a specific recruitment job.
 *
 * @param {Request} request - The standard incoming API request wrapper.
 * @param {Object} context - URL route mapping parameters.
 * @param {Promise<{id: string}>} context.params - Async parameter identifier tuple.
 * @returns {Promise<NextResponse>} Complete job configuration or 404 error state.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { id } = await params;
        const job = await prisma.job.findFirst({
            where: {
                id
            },
            select: {
                id: true,
                title: true,
                jobRole: true,
                resumeScreeningThreshold: true,
                resumeScreeningCriteria: true,
                jdExtractedDetails: true,
                createdByCredentialId: true,
                jobCreatedAt: true,
                jobUpdatedAt: true,
                applicationDeadline: true,
                aiGeneratedInterviewQuestions: true,
                jdFileName: true,
                jdPreviewUrl: true,
                organizationId: true,
                aiInterviewerName: true,
                aiInterviewerVoiceId: true,
                interviewMode: true,
                interviewType: true,
                organization: {
                    select: {
                        orgStatus: true,
                        name: true,
                    },
                },
                _count: {
                    select: { applications: { where: { isDeleted: false } } },
                },
            },
        });
        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        if (session.role !== "SUPER_ADMIN" && job.organizationId !== session.orgId) {
            return NextResponse.json({ error: "Access Denied: Ownership required to view job" }, { status: 403 });
        }
        if (job.organization && isOrgRestrictedStatus(job.organization.orgStatus)) {
            return NextResponse.json({ error: "This organization is currently suspended. Access is restricted." }, { status: 403 });
        }
        const screeningThreshold = Number(job.resumeScreeningThreshold ?? 60);
        const parsedCriteria = parseJobScreeningSettings(
            job.resumeScreeningCriteria,
            screeningThreshold,
        );
        const screeningCriteria = JSON.stringify({
            threshold: parsedCriteria.threshold,
            criteria: parsedCriteria.criteria,
        });
        const interviewQuestions = (() => {
            try {
                const raw = job.aiGeneratedInterviewQuestions;
                return raw ? JSON.parse(raw) : [];
            } catch {
                return [];
            }
        })();
        return NextResponse.json({
            ...job,
            organizationId: job.organizationId,
            screeningThreshold,
            screeningCriteria,
            interviewQuestions,
            applicants: job._count?.applications || 0,
            aiScreening: {
                enabled: true,
                weights: {}
            },
        }, {
            headers: {
                'Cache-Control': 'private, max-age=60',
            }
        });
    } catch (error: any) {
        return apiErrorResponse({
            route: "/api/jobs/[id]",
            method: "GET",
            error,
            body: { error: "Failed to fetch job" },
            status: 500,
            logLabel: "[GET_JOB_ERROR]:",
        });
    }
}
/**
 * PATCH handler to update metadata details for a specific recruitment job.
 *
 * @param {Request} request - The standard incoming API request wrapper.
 * @param {Object} context - URL route mapping parameters.
 * @param {Promise<{id: string}>} context.params - Async parameter identifier tuple.
 * @returns {Promise<NextResponse>} Success confirmation payload.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    let jobId: string = "";
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { id } = await params;
        jobId = id;
        const rawBody = await request.text();
        if (!rawBody.trim()) {
            return NextResponse.json(
                { error: "Empty request body" },
                { status: 400 }
            );
        }
        let body: unknown;
        try {
            body = JSON.parse(rawBody);
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON" },
                { status: 400 }
            );
        }
        const result = updateJobSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        const data = result.data;
        const existingJob = await prisma.job.findUnique({
            where: { id: jobId },
            select: {
                organizationId: true,
                jdExtractedDetails: true,
                jdPreviewUrl: true,
                aiInterviewerVoiceId: true,
            },
        });
        if (!existingJob) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        const isSuperAdmin = session.role === "SUPER_ADMIN";
        if (!isSuperAdmin && existingJob.organizationId !== session.orgId) {
            return NextResponse.json({ error: "Access Denied: Ownership required to modify job" }, { status: 403 });
        }
        const updateData: Record<string, unknown> = {};
        if (data.title !== undefined) updateData.title = data.title;
        if (data.jobRole !== undefined) updateData.jobRole = data.jobRole;
        if (data.applicationDeadline !== undefined) updateData.applicationDeadline = normalizeDeadlineDate(data.applicationDeadline as string | null | undefined);
        if (data.jdFileName !== undefined) updateData.jdFileName = data.jdFileName;
        if (data.jdPreviewUrl !== undefined) {
            const persistedJdUrl = data.jdPreviewUrl?.startsWith("blob:")
                ? existingJob.jdPreviewUrl || null
                : (data.jdPreviewUrl || null);
            if (persistedJdUrl !== null) {
                updateData.jdPreviewUrl = persistedJdUrl;
            }
        }
        // When jdExtractedDetails changes, re-derive all text fields from it
        if (data.jdExtractedDetails !== undefined) {
            const extractedStr = typeof data.jdExtractedDetails === "string"
                ? data.jdExtractedDetails
                : JSON.stringify(data.jdExtractedDetails);
            updateData.jdExtractedDetails = extractedStr;
            try {
                const parsed = JSON.parse(extractedStr);
                // derived fields removed -- jdExtractedDetails is source of truth
            } catch { /* keep existing values if parse fails */ }
        }
        if (data.resumeScreeningThreshold !== undefined || data.resumeScreeningCriteria !== undefined) {
            if (data.resumeScreeningThreshold !== undefined) updateData.resumeScreeningThreshold = data.resumeScreeningThreshold;
            const rawCriteria = data.resumeScreeningCriteria;
            const parsedCriteria = typeof rawCriteria === "string"
                ? safeJsonParse(rawCriteria, {})
                : (rawCriteria || {});
            const normalizedCriteria = sanitizeScreeningCriteria(parsedCriteria);
            const mergedCriteria = {
                ...normalizedCriteria,
                ...(data.resumeScreeningThreshold !== undefined ? { threshold: data.resumeScreeningThreshold } : {}),
            };
            updateData.resumeScreeningCriteria = JSON.stringify(mergedCriteria);
        }
        if (data.aiGeneratedInterviewQuestions !== undefined) updateData.aiGeneratedInterviewQuestions = data.aiGeneratedInterviewQuestions ? JSON.stringify(data.aiGeneratedInterviewQuestions) : undefined;
        Object.assign(
            updateData,
            normalizeJobAiConfig({
                current: { aiInterviewerVoiceId: existingJob.aiInterviewerVoiceId },
                next: { aiInterviewerVoiceId: data.aiInterviewerVoiceId },
            })
        );
        if (data.aiInterviewerName !== undefined) updateData.aiInterviewerName = data.aiInterviewerName;
        if (data.interviewMode !== undefined) updateData.interviewMode = data.interviewMode;
        if (data.interviewType !== undefined) updateData.interviewType = data.interviewType;
        if (Object.keys(updateData).length === 0) {
            return NextResponse.json(
                { error: "No valid fields provided for update" },
                { status: 400 }
            );
        }
        const updated = await prisma.job.update({
            where: { id: jobId },
            data: updateData,
        });
        return NextResponse.json(updated);
    } catch (error: any) {
        return apiErrorResponse({
            route: `/api/jobs/${jobId}`,
            method: "PATCH",
            error,
            body: { error: "Failed to update job" },
            status: 500,
            logLabel: "Error updating job:",
        });
    }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { id } = await params;
        const jobId = id;
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { organizationId: true, jdPreviewUrl: true }
        });
        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        const isSuperAdmin = session.role === "SUPER_ADMIN";
        if (!isSuperAdmin && job.organizationId !== session.orgId) {
            return NextResponse.json({ error: "Access Denied: Ownership required to remove job" }, { status: 403 });
        }
        // -- STORAGE CLEANUP: remove the JD file from R2 ------------------------
        await deleteUrlTargets([{ url: job.jdPreviewUrl }]);
        // -- SOFT DELETE: DATABASE CLEANUP (Cascading) ---------------------------
        // We use raw SQL to handle appending timestamps to unique columns safely.
        await prisma.$transaction(async (tx) => {
            const timestamp = Date.now().toString();
            // 1. Soft Delete Job
            await tx.$executeRaw`UPDATE "Job" SET "isDeleted" = true WHERE "id" = ${jobId}`;
            // 4. Soft Delete Applications (Application holds candidate/resume data directly --
            // the separate ResumeCandidate table no longer exists)
            await tx.$executeRaw`UPDATE "Application" SET "isDeleted" = true WHERE "jobId" = ${jobId}`;
            // 5. Soft Delete Interviews (rename accessToken only -- applicationId is a
            // real FK to Application.id, which is not renamed on soft delete, so
            // renaming it here would violate Interview_applicationId_fkey)
            await tx.$executeRaw`
                UPDATE "Interview"
                SET "isDeleted" = true,
                    "candidateInviteToken" = 'del_' || ${timestamp} || '_' || "candidateInviteToken"
                WHERE "applicationId" IN (SELECT "id" FROM "Application" WHERE "jobId" = ${jobId})
            `;
            // 6. Soft Delete Support Tickets
            await tx.$executeRaw`
                UPDATE "SupportTicket" SET "ticketStatus" = 'DELETED'
                WHERE "interviewId" IN (
                    SELECT "id" FROM "Interview" WHERE "applicationId" IN (
                        SELECT "id" FROM "Application" WHERE "jobId" = ${jobId}
                    )
                )
            `;
        });
        return NextResponse.json({ message: "Job soft-deleted successfully" });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/jobs/[id]",
            method: "DELETE",
            error,
            body: { error: "Failed to delete job" },
            status: 500,
            logLabel: "Error deleting job:",
        });
    }
}
