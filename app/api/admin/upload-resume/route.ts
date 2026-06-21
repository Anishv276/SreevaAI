import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { putObject } from "@/lib/s3";
import { getSession, isAdminRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const RESUME_BUCKET = process.env.R2_RESUMES_BUCKET || "resumes";

function sanitizeFileName(name: string) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// POST /api/admin/upload-resume
// Uploads a single PDF to R2 and returns the public URL.
// Used by AddCandidateDrawer in interview-only mode.
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const driveId = formData.get("driveId") as string | null;

        if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
        if (!driveId) return NextResponse.json({ error: "No driveId" }, { status: 400 });

        // Verify drive belongs to org
        const drive = await prisma.drive.findUnique({
            where: { id: driveId },
            select: { orgId: true, organization: { select: { slug: true } } },
        });
        if (!drive || drive.orgId !== session.orgId) {
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
        }

        const orgSlug = drive.organization?.slug || "org";
        const safeName = sanitizeFileName(file.name);
        const key = `${orgSlug}/${driveId}/${randomUUID()}-${safeName}`;

        const buffer = Buffer.from(await file.arrayBuffer());
        const url = await putObject(RESUME_BUCKET, key, buffer, "application/pdf");

        return NextResponse.json({ url });
    } catch (err) {
        console.error("[upload-resume] error:", err);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
