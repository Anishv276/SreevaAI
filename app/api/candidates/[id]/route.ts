
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = (await params).id;

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
              d.location AS "driveLocation"
            FROM "Application" a
            LEFT JOIN "Drive" d ON d.id = a."driveId"
            WHERE a.id = $1
            LIMIT 1
            `,
            id
        );

        const candidate = Array.isArray(candidateRows) && candidateRows.length > 0 ? candidateRows[0] as any : null;

        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
        }

        const assessment = await (prisma as any).assessment.findUnique({
            where: { applicationId: id },
            include: {
                questions: true,
                responses: true,
                events: {
                    orderBy: { timestamp: 'asc' }
                }
            }
        });

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
                location: candidate.driveLocation,
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
