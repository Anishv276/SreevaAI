import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { putObject } from "@/lib/s3";
import { getSession, isAdminRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logResumeUploadError } from "@/lib/slack-error-logger";

const RESUME_BUCKET = process.env.R2_RESUMES_BUCKET || "resumes";

function sanitizeFileName(name: string) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// POST /api/admin/upload-resume
// Uploads a single PDF to R2 and returns the public URL.
// Used by AddCandidateDrawer in interview-only mode.
export async function POST(request: Request) {
    let jobTitle: string | undefined;
    let orgName: string | undefined;
    try {
        const session = await getSession();
        if (!session || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const jobId = formData.get("jobId") as string | null;

        if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
        if (!jobId) return NextResponse.json({ error: "No jobId" }, { status: 400 });

        // Verify job belongs to org
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { title: true, organizationId: true, organization: { select: { name: true, urlSlug: true } } },
        });
        if (!job || job.organizationId !== session.orgId) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        jobTitle = job.title;
        orgName = job.organization?.name;

        const orgSlug = job.organization?.urlSlug || "org";
        const safeName = sanitizeFileName(file.name);
        const key = `${orgSlug}/${jobId}/${randomUUID()}-${safeName}`;

        const buffer = Buffer.from(await file.arrayBuffer());
        const url = await putObject(RESUME_BUCKET, key, buffer, "application/pdf");

        return NextResponse.json({ url });
    } catch (err) {
        console.error("[upload-resume] error:", err);
        await logResumeUploadError({
            orgName: orgName || "unknown",
            jobName: jobTitle || "unknown",
            error: err instanceof Error ? err.message : String(err),
            reason: "Resume upload to storage failed",
        });
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
