import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string; candidateId: string }> }
) {
    try {
        const { id: driveId, candidateId } = await params;
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ error: "Email required" }, { status: 400 });
        }

        const candidate = await prisma.resumeCandidate.findUnique({
            where: { id: candidateId },
        });

        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
        }

        if (candidate.driveId !== driveId) {
            return NextResponse.json({ error: "Candidate not in this drive" }, { status: 403 });
        }

        // Get drive info for interview details
        const drive = await prisma.drive.findUnique({
            where: { id: driveId },
        });

        if (!drive) {
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
        }

        // TODO: Implement actual email sending via your email provider
        // For now, just log and return success
        console.log(
            `[RESUME-SCREENING] Sending interview link to ${email} for ${candidate.fullName} on drive ${drive.title}`
        );

        // In a real implementation, you would:
        // 1. Generate an interview access token
        // 2. Create interview record
        // 3. Send email with interview link via your email provider (SendGrid, AWS SES, etc.)

        return NextResponse.json({
            success: true,
            message: `Interview link sent to ${email}`,
        });
    } catch (err) {
        console.error("[RESUME-SCREENING] send-interview error:", err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
