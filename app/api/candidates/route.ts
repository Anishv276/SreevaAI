import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resumeQueue, gradingQueue } from "@/lib/queue";
import { createCandidateSchema, bulkDeleteCandidatesSchema, candidateQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const driveId = searchParams.get("driveId");

        const queryResult = candidateQuerySchema.safeParse({ driveId });
        if (!queryResult.success) {
            return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
        }

        const candidates = queryResult.data.driveId
            ? await prisma.$queryRawUnsafe(
                `
                SELECT
                  a.id,
                  a."fullName",
                  a.email,
                  a.status,
                  a."aiScore",
                  a."createdAt",
                  a."experienceYears",
                  a."relevantYears",
                  a.location,
                  d.title AS "driveTitle",
                  s.status AS "assessmentStatus",
                  i.status AS "interviewStatusRaw"
                FROM "Application" a
                LEFT JOIN "Drive" d ON d.id = a."driveId"
                LEFT JOIN "Assessment" s ON s."applicationId" = a.id
                LEFT JOIN "Interview" i ON i."applicationId" = a.id
                WHERE a."driveId" = $1
                ORDER BY a."createdAt" DESC
                `,
                queryResult.data.driveId
            )
            : await prisma.$queryRawUnsafe(
                `
                SELECT
                  a.id,
                  a."fullName",
                  a.email,
                  a.status,
                  a."aiScore",
                  a."createdAt",
                  a."experienceYears",
                  a."relevantYears",
                  a.location,
                  d.title AS "driveTitle",
                  s.status AS "assessmentStatus",
                  i.status AS "interviewStatusRaw"
                FROM "Application" a
                LEFT JOIN "Drive" d ON d.id = a."driveId"
                LEFT JOIN "Assessment" s ON s."applicationId" = a.id
                LEFT JOIN "Interview" i ON i."applicationId" = a.id
                ORDER BY a."createdAt" DESC
                `
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
                location: app.location || "Remote",
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

        const { driveId, fullName, email, phone, resumeUrl, structuredResume, location, ...submissionData } = data;

        const application = await prisma.application.create({
            data: {
                driveId,
                fullName: fullName.trim(),
                email: email.toLowerCase().trim(),
                phone: phone.trim(),
                location: location?.trim() || null,
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
        const body = await request.json();

        const result = bulkDeleteCandidatesSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { ids } = result.data;

        try {
            const waitingResume = await resumeQueue.getJobs(['waiting', 'delayed', 'active']);
            for (const job of waitingResume) {
                if (ids.includes(job.data.applicationId)) {
                    await job.remove();
                }
            }
            const waitingGrading = await gradingQueue.getJobs(['waiting', 'delayed', 'active']);
            for (const job of waitingGrading) {
                if (ids.includes(job.data.applicationId)) {
                    await job.remove();
                }
            }
        } catch (queueErr) {
            console.warn("[DELETE] Could not clean queue jobs:", queueErr);
        }

        await prisma.application.deleteMany({
            where: { id: { in: ids } }
        });

        return NextResponse.json({ message: `${ids.length} candidates deleted successfully` });
    } catch (error) {
        console.error("Error bulk deleting candidates:", error);
        return NextResponse.json({ error: "Failed to delete candidates" }, { status: 500 });
    }
}
