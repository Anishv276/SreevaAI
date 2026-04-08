import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resumeQueue } from "@/lib/queue";
import { createCandidateSchema, bulkDeleteCandidatesSchema } from "@/lib/validation";
import { getSession } from "@/lib/auth";
import { sanitizeObject } from "@/lib/utils";
import { isRateLimited } from "@/lib/ratelimit";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const driveIdStr = searchParams.get("driveId");
        const driveId = driveIdStr ? parseInt(driveIdStr) : null;
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const search = searchParams.get("search")?.trim() || "";
        const status = searchParams.get("status") || "all";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "10");
        const offset = (page - 1) * limit;

        const baseSelect = `
            SELECT a.*, d.title AS "driveTitle", i.status AS "interviewStatusRaw"
            FROM "Application" a
            JOIN "Drive" d ON d.id = a."driveId"
            LEFT JOIN "Interview" i ON i."applicationId" = a.id
        `;

        // ── Security & Filtering ───────────────────
        const isSuperAdmin = session?.role === "SUPER_ADMIN";
        const orgId = isSuperAdmin 
            ? (searchParams.get("orgId") || session?.orgId) 
            : session?.orgId;

        if (!orgId) {
            return NextResponse.json({ candidates: [], pagination: { total: 0, pages: 0, page, limit } });
        }

        let dateClause = "";
        let searchClause = "";
        let statusClause = "";
        let paramIndex = driveId ? 3 : 2;
        const queryParams: any[] = driveId ? [driveId, orgId] : [orgId];

        if (startDate) {
            dateClause += ` AND a."createdAt" >= $${paramIndex++}`;
            queryParams.push(new Date(startDate));
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            dateClause += ` AND a."createdAt" <= $${paramIndex++}`;
            queryParams.push(end);
        }

        if (status && status !== "all") {
            statusClause += ` AND a."status" = $${paramIndex++}`;
            queryParams.push(status);
        }

        if (search) {
            searchClause = ` AND (a."fullName" ILIKE $${paramIndex} OR a."email" ILIKE $${paramIndex} OR d."title" ILIKE $${paramIndex})`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        const candidates = await prisma.$queryRawUnsafe(
            `${baseSelect}
            WHERE d."orgId" = ${driveId ? "$2" : "$1"}
            ${driveId ? 'AND a."driveId" = $1' : ""}
            ${dateClause}
            ${statusClause}
            ${searchClause}
            ORDER BY a."createdAt" DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
            ...queryParams, limit, offset
        );

        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*)::INT 
            FROM "Application" a 
            JOIN "Drive" d ON d.id = a."driveId" 
            WHERE d."orgId" = ${driveId ? "$2" : "$1"}
            ${driveId ? 'AND a."driveId" = $1' : ""}
            ${dateClause}
            ${statusClause}
            ${searchClause}
        `;
        
        const countResult = await prisma.$queryRawUnsafe<any[]>(countQuery, ...queryParams);
        const total = countResult[0]?.count || 0;

        const formattedCandidates = (candidates as any[]).map((app: any) => {
            const interviewStateRaw = String(app.interviewStatusRaw || "").toUpperCase();
            const appStatusUpper = String(app.status || "").toUpperCase();
            const isInterviewStage = [
                "SHORTLISTED",
                "ACCEPTED",
                "INTERVIEW IN PROGRESS",
                "INTERVIEWING",
                "INTERVIEW_IN_PROGRESS",
                "COMPLETED",
                "INTERVIEW COMPLETED",
                "INTERVIEW_COMPLETED",
            ].includes(appStatusUpper);

            let displayStatus = app.status;
            let interviewStatus = "Not Selected";
            
            if (isInterviewStage) {
                if (!interviewStateRaw || interviewStateRaw === "PENDING") {
                    displayStatus = "Interview Pending";
                    interviewStatus = "Interview Pending";
                } else if (interviewStateRaw === "IN_PROGRESS" || interviewStateRaw === "STARTED") {
                    displayStatus = "Interview In Progress";
                    interviewStatus = "Interview In Progress";
                } else if (interviewStateRaw === "COMPLETED") {
                    displayStatus = "Interview Completed";
                    interviewStatus = "Interview Completed";
                } else {
                    displayStatus = "Shortlisted";
                    interviewStatus = "Interview Pending";
                }
            }

            const normalizedStatus = String(displayStatus || "").toUpperCase();
            const mainStatus = normalizedStatus === "REJECTED" ? "Rejected" : "Shortlisted";

            return {
                id: app.id,
                driveId: app.driveId,
                name: app.fullName,
                email: app.email,
                role: app.driveTitle || "Unknown Role",
                score: app.aiScore || 0,
                status: mainStatus,
                interviewStatus,
                date: new Date(app.createdAt).toLocaleDateString(),
                experienceYears: app.experienceYears,
                relevantYears: app.relevantYears,
                passportUrl: app.passportUrl,
            };
        });

        return NextResponse.json({
            candidates: formattedCandidates,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Error fetching candidates:", error);
        return NextResponse.json({ error: "Failed to fetch candidates" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const rawBody = await request.json();
        const body = sanitizeObject(rawBody);

        const result = createCandidateSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const data = result.data;

        // ── RATE LIMITING ───────────────────────────────────
        const isLimited = await isRateLimited(`apply:${data.email.toLowerCase().trim()}`, 5, 3600);
        if (isLimited) {
            return NextResponse.json({ 
                error: "You've submitted too many applications recently. Please try again in an hour.", 
                code: "RATE_LIMIT_EXCEEDED" 
            }, { status: 429 });
        }

        const drive = await prisma.drive.findUnique({
            where: { id: data.driveId }, include: { organization: { select: { isActive: true } } },
        });

        if (!drive) {
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
        }

        const now = new Date();
        const deadline = drive.deadline ? new Date(drive.deadline) : null;
        const isClosed = (deadline && deadline < now) || (drive as any).status === "CLOSED";

        if (isClosed) {
            return NextResponse.json({ 
                error: "Applications for this position are no longer being accepted.",
                code: "DRIVE_CLOSED"
            }, { status: 410 });
        }

        if (drive.organization && !drive.organization.isActive) {
            return NextResponse.json({ error: "Access Denied: This organization's recruitment portal is currently suspended." }, { status: 403 });
        }

        const existingApplication = await prisma.application.findFirst({
            where: {
                driveId: data.driveId,
                OR: [
                    { email: data.email.toLowerCase() },
                    { phone: data.phone.trim() }
                ]
            }
        });

        if (existingApplication) {
            const duplicateField = existingApplication.email.toLowerCase() === data.email.toLowerCase() 
                ? "email" : "phone";
            return NextResponse.json({ 
                error: `You have already applied for this position with the same ${duplicateField}.`,
                code: "ALREADY_APPLIED"
            }, { status: 409 });
        }

        const jdText = drive.description?.trim();
        if (!jdText || jdText.length < 50) {
            return NextResponse.json({ 
                error: "Job Description is missing or too short for AI analysis. Please update the Drive description first.",
                details: "JD length must be at least 50 characters." 
            }, { status: 400 });
        }

        const resumeText = data.resumeText?.trim() || "";

        const { 
            driveId, fullName, email, phone, resumeUrl, passportUrl, structuredResume, 
            experienceYears, relevantYears, ...submissionData 
        } = data;

        // EMERGENCY GUARD: Never save blob URLs to the database
        const finalResumeUrl = resumeUrl?.startsWith("blob:") ? undefined : resumeUrl?.trim();
        const finalPassportUrl = passportUrl?.startsWith("blob:") ? undefined : passportUrl?.trim();

        const application = await prisma.application.create({
            data: {
                driveId,
                fullName: fullName.trim(),
                email: email.toLowerCase().trim(),
                phone: phone.trim(),
                resumeUrl: finalResumeUrl || "https://example.com/resume.pdf",
                passportUrl: finalPassportUrl,
                resumeText: resumeText,
                experienceYears: experienceYears || (structuredResume as any)?.experience?.total_years || null,
                relevantYears: relevantYears || null,
                structuredResume: structuredResume ? JSON.stringify(structuredResume) : null,
                submissionData: submissionData as any,
                status: "Pending",
                aiScore: null,
                aiReport: null,
            },
        });

        await resumeQueue.add('process-new-candidate', {
            applicationId: application.id,
            resumeText, 
            resumeUrl: application.resumeUrl,
            structuredResume: structuredResume,
            jdText,
            drive,
            applicantEmail: application.email,
            applicantName: application.fullName
        }, {
            jobId: `resume-${application.id}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true, 
            removeOnFail: { count: 50 } 
        });

        return NextResponse.json(application);
    } catch (error) {
        console.error("Error creating application:", error);
        return NextResponse.json({ error: "Failed to create application" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const orgId = searchParams.get("orgId") || session?.orgId;

        let ids: string[] = [];
        try {
            const body = await request.json();
            const result = bulkDeleteCandidatesSchema.safeParse(body);
            if (result.success) {
                ids = result.data.ids;
            }
        } catch (e) {
            // No body provided
        }

        if (ids.length === 0 && !orgId) {
            return NextResponse.json({ error: "No candidates or organization specified for deletion" }, { status: 400 });
        }

        const whereClause: any = {
            drive: { orgId }
        };

        if (ids.length > 0) {
            whereClause.id = { in: ids };
        }

        const belongsToOrg = await prisma.application.findMany({
            where: whereClause,
            select: { id: true }
        });

        const validIds = belongsToOrg.map(a => a.id);
        if (validIds.length === 0) return NextResponse.json({ message: "No matching candidates found" });

        try {
            const candidatesToCleanup = await prisma.application.findMany({
                where: { id: { in: validIds } },
                select: { resumeUrl: true }
            });

            const { deleteObject, getKeyFromUrl } = await import("@/lib/s3");
            const bucket = process.env.R2_RESUMES_BUCKET || "resumes";

            for (const cand of candidatesToCleanup) {
                if (cand.resumeUrl) {
                    const key = getKeyFromUrl(cand.resumeUrl);
                    if (key) await deleteObject(bucket, key);
                }
            }
        } catch (storageErr) {
            console.error("[DELETE_CANDIDATE_STORAGE_ERROR]:", storageErr);
        }

        try {
            const waitingResume = await resumeQueue.getJobs(['waiting', 'delayed', 'active']);
            for (const job of waitingResume) {
                if (validIds.includes(job.data.applicationId)) {
                    await job.remove();
                }
            }
        } catch (queueErr) {
            console.warn("[DELETE] Could not clean queue jobs:", queueErr);
        }

        await prisma.application.deleteMany({
            where: { id: { in: validIds } }
        });

        return NextResponse.json({ message: `${validIds.length} candidates deleted successfully` });
    } catch (error) {
        console.error("Error bulk deleting candidates:", error);
        return NextResponse.json({ error: "Failed to delete candidates" }, { status: 500 });
    }
}
