import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resumeQueue } from "@/lib/queue";
import { getSession } from "@/lib/auth";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { id } = await params;

        const application = await prisma.application.findUnique({
            where: { id },
            include: { drive: true }
        });

        if (!application) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }

        const drive = application.drive;
        const jdText = drive.description?.trim();

        if (!jdText) {
            return NextResponse.json({ 
                error: "Job Description is missing. Cannot re-scan." 
            }, { status: 400 });
        }

        // Clear existing AI report to show "Processing" state on frontend
        await prisma.application.update({
            where: { id },
            data: { 
                resumeStatus: "pending",
                aiScore: null,
                aiReport: null 
            }
        });

        // Add to queue
        await resumeQueue.add('process-new-candidate', {
            applicationId: application.id,
            resumeText: application.resumeText,
            resumeUrl: application.resumeUrl,
            structuredResume: application.structuredResume ? JSON.parse(application.structuredResume as string) : null,
            jdText,
            drive, // drive is passed as is, worker will fetch latest from DB
            applicantEmail: application.email,
            applicantName: application.fullName,
            force: true
        }, {
            jobId: `resume-rescan-${application.id}-${Date.now()}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
            removeOnFail: { count: 10 }
        });

        return NextResponse.json({ message: "Rescan triggered successfully" });
    } catch (error) {
        console.error("Error triggering rescan:", error);
        return NextResponse.json({ error: "Failed to trigger rescan" }, { status: 500 });
    }
}
