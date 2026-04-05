import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resumeQueue, gradingQueue } from "@/lib/queue";
import { createCandidateSchema, bulkDeleteCandidatesSchema, candidateQuerySchema } from "@/lib/validation";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const driveIdStr = searchParams.get("driveId");
        const driveId = driveIdStr ? parseInt(driveIdStr) : null;

        const assessmentTableResult = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
            `
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'Assessment'
            ) AS "exists"
            `
        );

        const interviewTableResult = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
            `
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'Interview'
            ) AS "exists"
            `
        );

        const hasAssessmentTable = Boolean(assessmentTableResult?.[0]?.exists);
        const hasInterviewTable = Boolean(interviewTableResult?.[0]?.exists);

        const assessmentSelect = hasAssessmentTable
            ? `s.status AS "assessmentStatus"`
            : `NULL::TEXT AS "assessmentStatus"`;
        const interviewSelect = hasInterviewTable
            ? `i.status AS "interviewStatusRaw"`
            : `NULL::TEXT AS "interviewStatusRaw"`;

        const assessmentJoin = hasAssessmentTable
            ? `LEFT JOIN "Assessment" s ON s."applicationId" = a.id`
            : ``;
        const interviewJoin = hasInterviewTable
            ? `LEFT JOIN "Interview" i ON i."applicationId" = a.id`
            : ``;

        const baseSelect = `
            SELECT a.*, d.title AS "driveTitle", ${assessmentSelect}, ${interviewSelect}
            FROM "Application" a
            JOIN "Drive" d ON d.id = a."driveId"
            ${assessmentJoin}
            ${interviewJoin}
        `;

        const candidates = driveId
            ? await prisma.$queryRawUnsafe(
                `${baseSelect}
                WHERE a."driveId" = $1 AND d."orgId" = $2
                ORDER BY a."createdAt" DESC`,
                driveId, session.orgId
            )
            : await prisma.$queryRawUnsafe(
                `${baseSelect}
                WHERE d."orgId" = $1
                ORDER BY a."createdAt" DESC`,
                session.orgId
            );

        const formattedCandidates = (candidates as any[]).map((app: any) => {
            const interviewStateRaw = String(app.interviewStatusRaw || app.assessmentStatus || "").toUpperCase();
            const appStatusUpper = String(app.status || "").toUpperCase();
            const isInterviewStage = ["SHORTLISTED", "ACCEPTED", "INTERVIEW IN PROGRESS", "COMPLETED"].includes(appStatusUpper);

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

            const mainStatus =
                displayStatus === "Rejected"
                    ? "Rejected"
                    : displayStatus === "Borderline"
                        ? "Borderline"
                        : "Shortlisted";

            return {
                id: app.id,
                name: app.fullName,
                email: app.email,
                role: app.driveTitle || "Unknown Role",
                score: app.aiScore || 0,
                status: mainStatus,
                interviewStatus,
                date: new Date(app.createdAt).toLocaleDateString(),
                location: "Remote",
                experienceYears: app.experienceYears,
                relevantYears: app.relevantYears,
            };
        });

        return NextResponse.json(formattedCandidates);
    } catch (error) {
        console.error("Error fetching candidates:", error);
        return NextResponse.json({ error: "Failed to fetch candidates" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        const result = createCandidateSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const data = result.data;

        const drive = await prisma.drive.findUnique({
            where: { id: data.driveId },
        });

        if (!drive) {
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
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

        const { driveId, fullName, email, phone, resumeUrl, structuredResume, ...submissionData } = data;

        const application = await prisma.application.create({
            data: {
                driveId,
                fullName: fullName.trim(),
                email: email.toLowerCase().trim(),
                phone: phone.trim(),
                resumeUrl: resumeUrl?.trim() || "https://example.com/resume.pdf",
                resumeText: resumeText,
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
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true, // AUTO-DELETE from Redis after success
            removeOnFail: { count: 50 } // Keep only last 50 failures for debugging
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

        const body = await request.json();

        const result = bulkDeleteCandidatesSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { ids } = result.data;

        // ── SECURITY: Ensure candidates belong to the Org ──────
        const belongsToOrg = await prisma.application.findMany({
            where: { id: { in: ids }, drive: { orgId: session.orgId } },
            select: { id: true }
        });

        const validIds = belongsToOrg.map(a => a.id);
        if (validIds.length === 0) return NextResponse.json({ message: "No matching candidates found" });

        try {
            const waitingResume = await resumeQueue.getJobs(['waiting', 'delayed', 'active']);
            for (const job of waitingResume) {
                if (validIds.includes(job.data.applicationId)) {
                    await job.remove();
                }
            }
            const waitingGrading = await gradingQueue.getJobs(['waiting', 'delayed', 'active']);
            for (const job of waitingGrading) {
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
