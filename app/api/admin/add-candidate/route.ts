import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole } from "@/lib/auth";
import { generateId } from "@/lib/ids";
import { putObject } from "@/lib/s3";
import { randomUUID } from "crypto";
import { resumeQueue } from "@/lib/queue";

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
        const driveId = formData.get("driveId") as string | null;
        const fullName = (formData.get("fullName") as string | null)?.trim() || "";
        const email = (formData.get("email") as string | null)?.trim() || "";
        const phone = (formData.get("phone") as string | null)?.trim() || "";

        if (!driveId || !fullName || !email || !file) {
            return NextResponse.json({ error: "driveId, fullName, email, and file are required" }, { status: 400 });
        }

        const orgId = session.orgId;
        if (!orgId) return NextResponse.json({ error: "No org" }, { status: 403 });

        const drive = await prisma.drive.findUnique({
            where: { id: driveId },
            select: { orgId: true, title: true, organization: { select: { slug: true } } },
        });
        if (!drive || drive.orgId !== orgId) {
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
        }

        // Upload PDF to R2
        const orgSlug = drive.organization?.slug || orgId;
        const safeName = sanitizeFileName(file.name);
        const key = `resume/${orgSlug}/${driveId}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const resumeUrl = await putObject(RESUME_BUCKET, key, buffer, "application/pdf");

        // Create Application with the form-provided metadata preserved
        const appId = generateId("app", fullName);
        await prisma.application.create({
            data: {
                id: appId,
                fullName,
                email,
                phone,
                resumeUrl,
                fileName: file.name,
                resumeData: JSON.stringify({
                    source: { bucket: RESUME_BUCKET, key, url: resumeUrl },
                }),
                aiReport: JSON.stringify({ processing: { progress: 0, stage: "waiting" } }),
                driveId,
                resumeStatus: "waiting",
                interviewStatus: "pending",
                hiringStatus: "pending",
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
        return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
    }
}
