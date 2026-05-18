import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCandidateCorpusToPinecone } from "@/lib/pinecone";
import { getSession, isAdminRole } from "@/lib/auth";

/**
 * API to manually or automatically sync a candidate's data to Pinecone.
 * Called after resume processing and after interview completion.
 */
export async function POST(
    _req: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        let session: Awaited<ReturnType<typeof getSession>> | null = null;
        const internalSecret = process.env.WORKER_SYNC_TOKEN?.trim() || process.env.JWT_SECRET?.trim();
        const internalToken = _req.headers.get("x-internal-sync-token")?.trim();
        const isInternalRequest = Boolean(internalSecret && internalToken && internalToken === internalSecret);

        if (!isInternalRequest) {
            session = await getSession();
            if (!session || !isAdminRole(session.role)) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        const { id } = await context.params;

        const app = await prisma.application.findUnique({
            where: { id },
            include: {
                interview: true,
                drive: { select: { id: true, title: true, orgId: true } },
            },
        });

        if (!app) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }

        // -- AUTHORIZATION ---------------------------------
        if (session?.orgId && app.drive.orgId !== session.orgId) {
            return NextResponse.json({ error: "Forbidden: Candidate belongs to another organization" }, { status: 403 });
        }
        // --------------------------------------------------

        console.log(`[SYNC_ENGINE]: Syncing ${app.fullName} to Pinecone...`);

        const syncResult = await syncCandidateCorpusToPinecone({
            applicationId: app.id,
            orgId: app.drive.orgId || "",
            fullName: app.fullName,
            email: app.email,
            jobTitle: app.drive.title,
            driveId: app.driveId,
            status: app.hiringStatus,
            resumeStatus: app.resumeStatus,
            aiScore: app.aiScore ?? 0,
            createdAt: app.createdAt.toISOString(),
            documents: [
                {
                    type: "resume",
                    text: app.resumeText,
                    createdAt: app.createdAt.toISOString(),
                },
                {
                    type: "resume_report",
                    text: app.aiReport,
                    createdAt: app.createdAt.toISOString(),
                },
                {
                    type: "interview_transcript",
                    text: app.interview?.interviewTranscript,
                    createdAt: app.interview?.createdAt?.toISOString() || app.createdAt.toISOString(),
                },
                {
                    type: "interview_report",
                    text: app.interview?.interviewReport,
                    createdAt: app.interview?.createdAt?.toISOString() || app.createdAt.toISOString(),
                },
            ],
        });

        return NextResponse.json({
            success: true,
            ...syncResult,
        });
    } catch (error: any) {
        console.error("[SYNC_ENGINE_ERROR]:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
