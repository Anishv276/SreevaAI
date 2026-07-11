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
        const where: Prisma.JobWhereInput = {};
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
        console.error("Error fetching jobs:", error);
        return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
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
                    where: { organizationId: session.orgId }
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
                organizationId: session.orgId!,
                createdByCredentialId: session.userId,
                ...aiConfig,
            },
        });
        return NextResponse.json(job);
    } catch (error: any) {
        console.error("Error creating job:", error);
        return NextResponse.json({
            error: "Failed to create job",
            details: error.message,
            code: error.code
        }, { status: 500 });
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
            select: { id: true },
        });
        const validIds = belongsToOrg.map((d: (typeof belongsToOrg)[number]) => d.id);
        if (validIds.length === 0) return NextResponse.json({ message: "No matching jobs found" });
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
            // 5. Soft Delete Interviews (rename unique keys via Raw SQL)
            if (validIds.length > 0) {
                const idList = Prisma.join(validIds);
                await tx.$executeRaw`
                    UPDATE "Interview"
                    SET "isDeleted" = true,
                        "applicationId" = 'del_' || ${timestamp} || '_' || "applicationId",
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
        console.error("Error bulk deleting jobs:", error);
        return NextResponse.json({ error: "Failed to delete jobs" }, { status: 500 });
    }
}
