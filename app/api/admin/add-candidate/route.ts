import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole } from "@/lib/auth";
import { generateId } from "@/lib/ids";
import { putObject } from "@/lib/s3";
import { randomUUID } from "crypto";
import { resumeQueue } from "@/lib/queue";
import { validatePdfUpload } from "@/lib/file-validation";

const RESUME_BUCKET = process.env.R2_RESUMES_BUCKET || "resumes";

function sanitizeFileName(name: string) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// POST /api/admin/add-candidate (multipart/form-data)
// ATS mode: add a single candidate with name/email/phone + resume PDF.
// Uploads resume to R2, creates Application with correct metadata, enqueues screening.
// The name/email/phone from the form are preserved (unlike bulk upload which reads from filename).
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const jobId = formData.get("jobId") as string | null;
        const fullName = (formData.get("fullName") as string | null)?.trim() || "";
        const email = (formData.get("email") as string | null)?.trim() || "";
        const phone = (formData.get("phone") as string | null)?.trim() || "";

        if (!jobId || !fullName || !email || !file) {
            return NextResponse.json({ error: "jobId, fullName, email, and file are required" }, { status: 400 });
        }

        const orgId = session.orgId;
        if (!orgId) return NextResponse.json({ error: "No org" }, { status: 403 });

        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { organizationId: true, title: true, organization: { select: { urlSlug: true } } },
        });
        if (!job || job.organizationId !== orgId) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const validationError = validatePdfUpload(file, buffer);
        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        // Upload PDF to R2
        const orgSlug = job.organization?.urlSlug || orgId;
        const safeName = sanitizeFileName(file.name);
        const key = `resume/${orgSlug}/${jobId}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
        const resumeUrl = await putObject(RESUME_BUCKET, key, buffer, "application/pdf");

        // Create Application with the form-provided metadata preserved
        const appId = generateId("app", fullName);
        await prisma.application.create({
            data: {
                id: appId,
                candidateFullName: fullName,
                candidateEmail: email,
                candidatePhone: phone,
                resumeFileUrl: resumeUrl,
                resumeFileName: file.name,
                resumeParsedData: JSON.stringify({
                    source: { bucket: RESUME_BUCKET, key, url: resumeUrl },
                }),
                resumeAiReport: JSON.stringify({ processing: { progress: 0, stage: "waiting" } }),
                jobId,
                resumeScreeningStatus: "waiting",
                interviewPhaseStatus: "pending",
            },
        });

        await resumeQueue.add(
            "screen-resume",
            {
                applicationId: appId,
                bucket: RESUME_BUCKET,
                key,
                fileName: file.name,
                orgId,
            },
            { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
        );

        return NextResponse.json({ success: true, applicationId: appId });
    } catch (err: any) {
        console.error("[add-candidate] POST error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
