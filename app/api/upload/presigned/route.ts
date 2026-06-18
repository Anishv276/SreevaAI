import { NextResponse } from "next/server";
import { getPresignedUploadUrl } from "@/lib/s3";
import { v4 as uuidv4 } from "uuid";
import { presignedUrlSchema } from "@/lib/validation";
import { getSession, isAdminRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const result = presignedUrlSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: "Validation failed", details: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        const { fileName, fileType, fileSize, driveId, type } = result.data;
        // -- AUTHORIZATION & QUOTA -------------------------
        const session = await getSession();
        const isJD = type === "JD";
        if (fileSize) {
            const limit = isJD ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
            if (fileSize > limit) {
                return NextResponse.json({ 
                    error: `File too large. Maximum size for ${type} is ${limit / (1024 * 1024)}MB` 
                }, { status: 413 });
            }
        }
        if (isJD) {
            if (!session || !isAdminRole(session.role)) {
                return NextResponse.json({ error: "Unauthorized: Admin access required for JD uploads" }, { status: 401 });
            }
        } else {
            // For public uploads, verify the driveId exists and is active
            if (!driveId) {
                return NextResponse.json({ error: "driveId is required for resume uploads" }, { status: 400 });
            }
            const drive = await (prisma.drive as any).findUnique({
                where: { id: driveId },
                select: { status: true }
            });
            if (!drive || (drive as any).status === "CLOSED") {
                return NextResponse.json({ error: "Applications for this position are closed" }, { status: 403 });
            }
        }
        // --------------------------------------------------
        const uniqueId = uuidv4();
        const safeFileName = fileName.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
        // -- GENERATE KEY --
        let orgSlug = "unknown-org";
        let driveTitle = "unknown-job";
        if (session?.orgId) {
            const org = await prisma.organization.findUnique({ where: { id: session.orgId }, select: { slug: true }});
            if (org?.slug) orgSlug = org.slug;
        }
        if (driveId) {
            const driveData = await prisma.drive.findUnique({
                where: { id: driveId },
                select: { title: true, organization: { select: { slug: true } } }
            });
            if (driveData) {
                driveTitle = driveData.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                if (driveData.organization?.slug) {
                    orgSlug = driveData.organization.slug;
                }
            }
        }
        // Pick BUCKET based on TYPE
        const bucket = isJD 
            ? (process.env.R2_JDS_BUCKET || "jds")
            : (process.env.R2_RESUMES_BUCKET || "resumes");
        const key = isJD
            ? `JDs/${orgSlug}/${uniqueId}_${safeFileName}`
            : `resume/${orgSlug}/${driveTitle}/${uniqueId}_${safeFileName}`;
        const uploadUrl = await getPresignedUploadUrl(bucket, key, fileType);
        // Pick PUBLIC DOMAIN based on TYPE
        let publicUrlBase = "";
        if (isJD) {
            publicUrlBase = process.env.NEXT_PUBLIC_R2_JDS_URL || "https://pub-e4a8b24775c741f6a650def856cfec9f.r2.dev";
        } else {
            publicUrlBase = process.env.NEXT_PUBLIC_R2_RESUMES_URL || "https://pub-e4a8b24775c741f6a650def856cfec9f.r2.dev";
        }
        const publicUrl = `${publicUrlBase.replace(/\/$/, '')}/${key}`;
        return NextResponse.json({ 
            uploadUrl, 
            key,
            publicUrl 
        });
    } catch (error) {
        console.error("[R2_PRESIGNED_ERROR]:", error);
        return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
    }
}
