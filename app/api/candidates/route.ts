import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resumeQueue } from "@/lib/queue";
import { createCandidateSchema, bulkDeleteCandidatesSchema } from "@/lib/validation";
import { getSession } from "@/lib/auth";
import { sanitizeObject } from "@/lib/utils";
import { deleteCandidateEmbeddings } from "@/lib/pinecone";
import { submissionLimiter } from "@/lib/rate-limit";
import { generateId } from "@/lib/ids";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const driveId = searchParams.get("driveId");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const search = searchParams.get("search")?.trim() || "";
        const resumeStatus = searchParams.get("resumeStatus") || searchParams.get("status") || "all";
        const interviewStatus = searchParams.get("interviewStatus") || "all";
        const hiringStatus = searchParams.get("hiringStatus") || "all";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "10");
        const offset = (page - 1) * limit;

        const baseSelect = `
            SELECT a.*, d.title AS "driveTitle"
            FROM "Application" a
            JOIN "Drive" d ON d.id = a."driveId"
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

        if (resumeStatus && resumeStatus !== "all") {
            statusClause += ` AND a."resumeStatus" = $${paramIndex++}`;
            queryParams.push(resumeStatus.toLowerCase());
        }

        if (interviewStatus && interviewStatus !== "all") {
            statusClause += ` AND a."interviewStatus" = $${paramIndex++}`;
            queryParams.push(interviewStatus.toLowerCase());
        }

        if (hiringStatus && hiringStatus !== "all") {
            statusClause += ` AND a."hiringStatus" = $${paramIndex++}`;
            queryParams.push(hiringStatus.toLowerCase());
        }

        if (search) {
            searchClause = ` AND (a."fullName" ILIKE $${paramIndex} OR a."email" ILIKE $${paramIndex} OR d."title" ILIKE $${paramIndex})`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        const dataQuery = `${baseSelect}
            WHERE d."orgId" = ${driveId ? "$2" : "$1"}
            ${driveId ? 'AND a."driveId" = $1' : ""}
            ${dateClause}
            ${statusClause}
            ${searchClause}
            ORDER BY a."createdAt" DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;

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


        const [candidates, countResult, statsResult] = await Promise.all([
            prisma.$queryRawUnsafe(dataQuery, ...queryParams, limit, offset),
            prisma.$queryRawUnsafe<any[]>(countQuery, ...queryParams),
            // Run stats as a separate simple query in parallel
            prisma.$queryRawUnsafe<any[]>(`
                SELECT
                    COUNT(*) FILTER (WHERE LOWER(a."resumeStatus") = 'shortlisted')::INT AS shortlisted,
                    COUNT(*) FILTER (WHERE LOWER(a."resumeStatus") = 'rejected')::INT AS rejected,
                    COUNT(*) FILTER (WHERE LOWER(a."hiringStatus") = 'hired')::INT AS hired,
                    COUNT(*) FILTER (WHERE LOWER(a."hiringStatus") = 'not hired')::INT AS not_hired,
                    COUNT(*) FILTER (WHERE LOWER(a."interviewStatus") = 'inprogress')::INT AS "interviewRunning",
                    COUNT(*) FILTER (WHERE LOWER(a."interviewStatus") = 'pending')::INT AS "interviewPending",
                    COUNT(*) FILTER (WHERE LOWER(a."interviewStatus") = 'finished')::INT AS "interviewCompleted"
                FROM "Application" a
                JOIN "Drive" d ON d.id = a."driveId"
                LEFT JOIN "Interview" i ON i."applicationId" = a.id
                WHERE d."orgId" = $1
                ${driveId && driveId !== "all" ? 'AND a."driveId" = $2' : ""}
            `, ...(driveId && driveId !== "all" ? [orgId, driveId] : [orgId]))
        ]);

        const total = countResult[0]?.count || 0;
        const statsRow = (statsResult as any[])[0] ?? {};

        if ((candidates as any[]).length > 0) {
            console.log("[candidates] first row keys:", Object.keys((candidates as any[])[0]));
        }

        const formattedCandidates = (candidates as any[]).map((app: any) => {
            return {
                id: app.id,
                driveId: app.driveId,
                name: app.fullName,
                email: app.email,
                role: app.driveTitle || app.drivetitle || "Unknown Role",
                score: app.aiScore || 0,
                status: app.resumeStatus,
                interviewStatus: app.interviewStatus,
                hiringStatus: app.hiringStatus,
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
            },
            stats: {
                shortlisted: Number(statsRow.shortlisted ?? 0),
                rejected: Number(statsRow.rejected ?? 0),
                hired: Number(statsRow.hired ?? 0),
                interviewRunning: Number(statsRow.interviewRunning ?? 0),
                interviewPending: Number(statsRow.interviewPending ?? 0),
                interviewCompleted: Number(statsRow.interviewCompleted ?? 0),
            }
        });
    } catch (error) {
        console.error("Error fetching candidates:", error);
        return NextResponse.json({ error: "Failed to fetch candidates" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        // ── RATE LIMITING ───────────────────
        const ip = request.headers.get("x-forwarded-for") || "unknown";
        const { success, remaining, reset } = await submissionLimiter.check(ip);
        
        if (!success) {
            return NextResponse.json({ 
                error: "Too many application attempts. Please try again later.",
                code: "RATE_LIMIT_EXCEEDED",
                resetAt: new Date(reset).toISOString()
            }, { 
                status: 429,
                headers: {
                    'X-RateLimit-Limit': '2000',
                    'X-RateLimit-Remaining': remaining.toString(),
                    'X-RateLimit-Reset': reset.toString()
                }
            });
        }

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

        const drive = await prisma.drive.findUnique({
            where: { id: data.driveId }, include: { organization: { select: { status: true } } },
        } as any);

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

        if ((drive as any).organization && (drive as any).organization.status !== "ACTIVE") {
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
            experienceYears, ...submissionData 
        } = data;

        // EMERGENCY GUARD: Never save blob URLs to the database
        const finalResumeUrl = resumeUrl?.startsWith("blob:") ? undefined : resumeUrl?.trim();
        const finalPassportUrl = passportUrl?.startsWith("blob:") ? undefined : passportUrl?.trim();

        const session = await getSession();
        const applicationId = generateId("app", fullName);
        const application = await prisma.application.create({
            data: {
                id: applicationId,
                driveId,
                fullName: fullName.trim(),
                email: email.toLowerCase().trim(),
                phone: phone.trim(),
                userId: session?.userId || null,
                resumeUrl: finalResumeUrl || "https://example.com/resume.pdf",
                passportUrl: finalPassportUrl,
                resumeText: resumeText,
                experienceYears: experienceYears ?? (structuredResume as any)?.experience?.total_years ?? null,
                structuredResume: structuredResume ? JSON.stringify(structuredResume) : null,
                submissionData: submissionData as any,
                resumeStatus: "pending",
                interviewStatus: "pending",
                hiringStatus: "pending",
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

        // ── VECTOR DB CLEANUP: Purge from Pinecone ──────────
        try {
            for (const cId of validIds) {
                await deleteCandidateEmbeddings(cId);
            }
        } catch (pineconeErr) {
             console.error("[BULK_DELETE_PINECONE_ERROR]:", pineconeErr);
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
