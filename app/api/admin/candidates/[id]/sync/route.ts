import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEmbedding } from "@/lib/openai";
import { upsertCandidateEmbedding } from "@/lib/pinecone";
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

        const sharedMeta = {
            applicationId: app.id,
            orgId: app.drive.orgId || "",
            fullName: app.fullName,
            email: app.email,
            jobTitle: app.drive.title,
            driveId: app.driveId,
            status: app.hiringStatus,
            resumeStatus: app.resumeStatus,
            aiScore: app.aiScore ?? 0,
        };

        // Index Resume
        if (app.resumeText) {
            const vector = await getEmbedding(app.resumeText);
            await upsertCandidateEmbedding(`${app.id}-resume`, vector, {
                ...sharedMeta,
                contentChunk: app.resumeText.substring(0, 3000),
                type: "resume",
                createdAt: app.createdAt.toISOString(),
            });
        }

        // Index Transcript
        if (app.interview?.interviewTranscript) {
            const vector = await getEmbedding(app.interview.interviewTranscript);
            await upsertCandidateEmbedding(`${app.id}-transcript`, vector, {
                ...sharedMeta,
                contentChunk: app.interview.interviewTranscript.substring(0, 3000),
                type: "transcript",
                createdAt: app.interview.createdAt.toISOString(),
            });
        }

        // Index AI Summary
        if (app.interview?.aiSummary) {
            const vector = await getEmbedding(app.interview.aiSummary);
            await upsertCandidateEmbedding(`${app.id}-summary`, vector, {
                ...sharedMeta,
                contentChunk: app.interview.aiSummary.substring(0, 3000),
                type: "summary",
                createdAt: app.interview.createdAt.toISOString(),
            });
        }

        // Index AI Report
        if (app.aiReport) {
            const vector = await getEmbedding(app.aiReport);
            await upsertCandidateEmbedding(`${app.id}-report`, vector, {
                ...sharedMeta,
                contentChunk: app.aiReport.substring(0, 3000),
                type: "report",
                createdAt: app.createdAt.toISOString(),
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("[SYNC_ENGINE_ERROR]:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
