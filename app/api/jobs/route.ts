import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { createJobSchema, bulkDeleteSchema } from "@/lib/validation";
import { getSession } from "@/lib/auth";
import { sanitizeObject } from "@/lib/utils";
import { generateId } from "@/lib/ids";
import { deleteUrlTargets } from "@/lib/delete-utils";
import { getRecordingUrl } from "@/lib/recording-state";
import { getOrgBillingStatus } from "@/lib/credits";
import { isJobCreationLocked } from "@/lib/job-limits";
import { normalizeJobAiConfig } from "@/lib/ai-provider-config";
import { getInterviewQuotaSupportMessage, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { parseOrgLimitValue } from "@/lib/org-limits";
import { parseJobScreeningSettings, sanitizeScreeningCriteria } from "@/lib/screening-criteria";
import { apiErrorResponse } from "@/lib/slack-error-logger";
function normalizeDeadlineDate(deadline?: string | null) {
    if (!deadline) return null;
    const parsed = new Date(`${deadline}T23:59:59.999`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "10");
        const skip = (page - 1) * limit;
        const orgId = searchParams.get("orgId");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const where: Prisma.JobWhereInput = { isDeleted: false };
        if (startDate || endDate) {
            where.jobCreatedAt = {};
            if (startDate) (where.jobCreatedAt as Prisma.DateTimeFilter).gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                (where.jobCreatedAt as Prisma.DateTimeFilter).lte = end;
            }
        }
        // -- ADMIN ACCESS: Filter by Role & Org -----------
        if (session.role === "SUPER_ADMIN") {
            if (orgId) where.organizationId = orgId;
        } else {
            where.organizationId = session.orgId;
        }
        // Search filters
        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { jobRole: { contains: search, mode: "insensitive" } }
            ];
        }
        const [jobs, total] = await Promise.all([
            prisma.job.findMany({
                where,
                orderBy: { jobCreatedAt: "desc" },
                skip,
                take: limit,
                select: {
                    id: true,
                    title: true,
                    jobRole: true,
                    resumeScreeningThreshold: true,
                    createdByCredentialId: true,
                    jobCreatedAt: true,
                    jobUpdatedAt: true,
                    resumeScreeningCriteria: true,
                    aiGeneratedInterviewQuestions: true,
                    jdFileName: true,
                    jdPreviewUrl: true,
                    organizationId: true,
                    applicationDeadline: true,
                    aiInterviewerName: true,
                    aiInterviewerVoiceId: true,
                    interviewMode: true,
                    interviewType: true,
                    _count: {
                        select: { applications: { where: { isDeleted: false } } },
                    },
                },
            }),
            prisma.job.count({ where })
        ]);
        const formattedJobs = jobs.map((job) => {
            const screeningThreshold = Number(job.resumeScreeningThreshold ?? 60);
            const parsedScreening = parseJobScreeningSettings(
                job.resumeScreeningCriteria,
                screeningThreshold,
            );
            return {
                ...job,
                applicants: job._count?.applications || 0,
                screeningThreshold: parsedScreening.threshold,
                screeningCriteria: JSON.stringify({
                    threshold: parsedScreening.threshold,
                    criteria: parsedScreening.criteria,
                }),
                aiScreening: {
                    enabled: true,
                },
                interviewQuestions: job.aiGeneratedInterviewQuestions ? JSON.parse(job.aiGeneratedInterviewQuestions) : []
            };
        });
        return NextResponse.json({
            jobs: formattedJobs,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        }, {
            headers: {
                'Cache-Control': 'private, max-age=45',
            }
        });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/jobs",
            method: "GET",
            error,
            body: { error: "Failed to fetch jobs" },
            status: 500,
            logLabel: "Error fetching jobs:",
        });
    }
}
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        if (session.orgId) {
            const org = await prisma.organizationDetails.findUnique({
                where: { id: session.orgId },
                select: { orgStatus: true, maxActiveJobs: true }
            });
            if (isOrgRestrictedStatus(org?.orgStatus)) {
                return NextResponse.json({ error: "Job creation is blocked because your organization is restricted." }, { status: 403 });
            }
            const billingStatus = await getOrgBillingStatus(session.orgId);
            if (billingStatus.totalInterviewsAllowed > 0 && !billingStatus.hasSufficientInterviews) {
                return NextResponse.json(
                    {
                        error: getInterviewQuotaSupportMessage("interviews"),
                        code: "NO_INTERVIEWS",
                    },
                    { status: 402 }
                );
            }
            const maxActiveJobs = parseOrgLimitValue(org?.maxActiveJobs);
            if (maxActiveJobs !== null) {
                const activeJobCount = await prisma.job.count({
                    where: { organizationId: session.orgId, isDeleted: false }
                });
                if (isJobCreationLocked(maxActiveJobs, activeJobCount)) {
                    return NextResponse.json(
                        {
                            error: "Job limit reached. Upgrade your plan or increase the limit to create another job.",
                            code: "JOB_LIMIT_REACHED",
                            activeJobCount,
                            maxActiveJobs,
                        },
                        { status: 409 }
                    );
                }
            }
        }
        const rawBody = await request.json();
        const body = sanitizeObject(rawBody);
        const result = createJobSchema.safeParse(body);
        if (!result.success) {
            console.error("[POST /api/jobs] Validation failed:", JSON.stringify(result.error.flatten().fieldErrors, null, 2));
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        const data = result.data;
        const aiConfig = normalizeJobAiConfig({
            next: { aiInterviewerVoiceId: data.aiInterviewerVoiceId },
        });
        const screeningCriteria = (() => {
            const raw = data.resumeScreeningCriteria;
            if (!raw) return {};
            if (typeof raw === "string") {
                try {
                    return JSON.parse(raw);
                } catch {
                    return {};
                }
            }
            return raw;
        })();
        const normalizedScreeningCriteria = sanitizeScreeningCriteria(screeningCriteria);
        const mergedScreeningCriteria = {
            ...normalizedScreeningCriteria,
            ...(data.resumeScreeningThreshold !== undefined ? { threshold: data.resumeScreeningThreshold } : {}),
        };
        const jobId = generateId("drv", data.title);
        const job = await prisma.job.create({
            data: {
                id: jobId,
                title: data.title,
                jobRole: data.jobRole || null,
                jdExtractedDetails: data.jdExtractedDetails || null,
                jdFileName: data.jdFileName || null,
                jdPreviewUrl: data.jdPreviewUrl?.startsWith("blob:") ? null : (data.jdPreviewUrl || null),
                resumeScreeningCriteria: JSON.stringify(mergedScreeningCriteria),
                resumeScreeningThreshold: data.resumeScreeningThreshold ?? 60,
                applicationDeadline: normalizeDeadlineDate(data.applicationDeadline as string | null | undefined),
                aiGeneratedInterviewQuestions: data.aiGeneratedInterviewQuestions ? JSON.stringify(data.aiGeneratedInterviewQuestions) : "[]",
                aiInterviewerName: data.aiInterviewerName || "Ishitha",
                interviewMode: data.interviewMode || "ats",
                interviewType: data.interviewType || "tech",
                organizationId: session.orgId!,
                createdByCredentialId: session.userId,
                ...aiConfig,
            },
        });
        if (data.jdExtractionJobId) {
            // Ledger row was created at extraction time keyed off the BullMQ queue
            // job id (no real Job existed yet) -- now that the Job row exists,
            // point jobId at it so the raw ledger data reflects the real Job.id.
            // eventId stays `jd:{queueJobId}` -- it's the row's idempotency key,
            // not shown anywhere, so changing it would just orphan the row.
            await prisma.usageEvent.updateMany({
                where: { eventId: `jd:${data.jdExtractionJobId}`, organizationId: session.orgId! },
                data: { jobId: job.id, jobTitle: job.title },
            }).catch((err) => console.error("[jobs] Failed to backfill jdExtraction ledger jobId:", err));
        }
        return NextResponse.json(job);
    } catch (error: any) {
        return apiErrorResponse({
            route: "/api/jobs",
            method: "POST",
            error,
            body: { error: "Failed to create job" },
            status: 500,
            logLabel: "Error creating job:",
        });
    }
}
export async function DELETE(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const body = await request.json();
        const result = bulkDeleteSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        const { ids } = result.data;
        // -- SECURITY: Ensure IDs belong to the Org -----------
        const belongsToOrg = await prisma.job.findMany({
            where: { id: { in: ids }, organizationId: session.orgId },
            select: { id: true, jdPreviewUrl: true },
        });
        const validIds = belongsToOrg.map((d: (typeof belongsToOrg)[number]) => d.id);
        if (validIds.length === 0) return NextResponse.json({ message: "No matching jobs found" });
        // -- STORAGE CLEANUP: remove JD files from R2 ----------------------------
        await deleteUrlTargets(belongsToOrg.map((d) => ({ url: d.jdPreviewUrl })));
        // -- SOFT DELETE: DATABASE CLEANUP (Cascading) ---------------------------
        await prisma.$transaction(async (tx) => {
            const timestamp = Date.now().toString();
            // 1. Soft Delete Jobs
            await tx.job.updateMany({
                where: { id: { in: validIds } },
                data: { isDeleted: true }
            });
            // 2. Soft Delete Applications
            await tx.application.updateMany({
                where: { jobId: { in: validIds } },
                data: { isDeleted: true }
            });
            // 5. Soft Delete Interviews (rename accessToken only -- applicationId is a
            // real FK to Application.id, which is not renamed on soft delete, so
            // renaming it here would violate Interview_applicationId_fkey)
            if (validIds.length > 0) {
                const idList = Prisma.join(validIds);
                await tx.$executeRaw`
                    UPDATE "Interview"
                    SET "isDeleted" = true,
                        "candidateInviteToken" = 'del_' || ${timestamp} || '_' || "candidateInviteToken"
                    WHERE "applicationId" IN (SELECT "id" FROM "Application" WHERE "jobId" IN (${idList}))
                `;
                // 6. Soft Delete Support Tickets
                await tx.$executeRaw`
                    UPDATE "SupportTicket" SET "ticketStatus" = 'DELETED'
                    WHERE "interviewId" IN (
                        SELECT "id" FROM "Interview" WHERE "applicationId" IN (
                            SELECT "id" FROM "Application" WHERE "jobId" IN (${idList})
                        )
                    )
                `;
            }
        });
        return NextResponse.json({ message: `${validIds.length} jobs soft-deleted successfully` });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/jobs",
            method: "DELETE",
            error,
            body: { error: "Failed to delete jobs" },
            status: 500,
            logLabel: "Error bulk deleting jobs:",
        });
    }
}
