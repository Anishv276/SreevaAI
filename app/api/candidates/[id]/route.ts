
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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

        const candidateRows = await prisma.$queryRawUnsafe(
            `
            SELECT
              a.id,
              a.status,
              a."fullName",
              a.email,
              a.phone,
              a."resumeUrl",
              a."aiScore",
              a."aiReport",
              a."structuredResume",
              a."experienceYears",
              a."relevantYears",
              a."resumeText",
              a."submissionData",
              a."driveId",
              a."userId",
              a."createdAt",
              a."updatedAt",
              d.title AS "driveTitle",
              d.department AS "driveDepartment",
              d.type AS "driveType",
              d."orgId" AS "orgId"
            FROM "Application" a
            LEFT JOIN "Drive" d ON d.id = a."driveId"
            WHERE a.id = $1 ${session.role !== "SUPER_ADMIN" ? 'AND d."orgId" = $2' : (targetOrgId ? 'AND d."orgId" = $2' : '')}
            LIMIT 1
            `,
            id,
            ...(session.role !== "SUPER_ADMIN" || targetOrgId ? [targetOrgId] : [])
        );

        const candidate = Array.isArray(candidateRows) && candidateRows.length > 0 ? candidateRows[0] as any : null;

        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
        }

        let assessment: any = null;
        try {
            const prismaWithAssessment = prisma as unknown as {
                assessment?: {
                    findUnique: (args: unknown) => Promise<unknown>;
                };
            };

            if (prismaWithAssessment.assessment) {
                assessment = await prismaWithAssessment.assessment.findUnique({
                    where: { applicationId: id },
                    include: {
                        questions: true,
                        responses: true,
                        events: {
                            orderBy: { timestamp: "asc" },
                        },
                    },
                });
            }
        } catch {
            assessment = null;
        }

        // Parse AI Report if it exists
        let aiData = {};
        try {
            if (candidate.aiReport) {
                // Handle case where aiReport might be double stringified or just string
                aiData = typeof candidate.aiReport === 'string'
                    ? JSON.parse(candidate.aiReport)
                    : candidate.aiReport;
            }
        } catch (e) {
            console.error("Failed to parse AI report", e);
        }

        let interview: any = null;
        try {
            const rows = await prisma.$queryRawUnsafe(
                'SELECT id, "applicationId", status, "accessToken", "expiresAt", "startedAt", "completedAt", "interviewRecordingUrl" AS "interviewRecordingUrl", "interviewTranscript" AS "interviewTranscript", "aiSummary" AS "aiSummary", "interviewRecordedAt", "interviewDuration", "createdAt", "updatedAt" FROM "Interview" WHERE "applicationId" = $1 LIMIT 1',
                id
            );
            interview = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        } catch {
            interview = null;
        }

        // Return the candidate object but ensure it matches what the frontend expects
        // (The frontend expects fullName, email, phone, aiScore, aiReport, etc.)
        return NextResponse.json({
            ...candidate,
            drive: {
                title: candidate.driveTitle,
                department: candidate.driveDepartment,
                type: candidate.driveType,
            },
            assessment,
            interview,
            // Keep formatted fields if helpful, but the raw Prisma fields are key
            formattedDate: new Date(candidate.createdAt).toLocaleDateString(),
            driveTitle: candidate.driveTitle || "Role N/A"
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
                resumeUrl: true 
            }
        });

        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found or unauthorized" }, { status: 404 });
        }

        // ── STORAGE CLEANUP: Purge Resume from R2 ──────────
        try {
            if (candidate.resumeUrl) {
                const { deleteObject, getKeyFromUrl } = await import("@/lib/s3");
                const bucket = process.env.R2_RESUMES_BUCKET || "resumes";
                const key = getKeyFromUrl(candidate.resumeUrl);
                if (key) await deleteObject(bucket, key);
            }
        } catch (storageErr) {
            console.error("[DELETE_SINGLE_CANDIDATE_STORAGE_ERROR]:", storageErr);
        }

        // ── DATABASE DELETION ─────────────────────────────
        await prisma.application.delete({
            where: { id }
        });

        return NextResponse.json({ message: "Candidate deleted successfully" });
    } catch (error) {
        console.error("Error deleting candidate:", error);
        return NextResponse.json({ error: "Failed to delete candidate" }, { status: 500 });
    }
}
