import { NextResponse } from "next/server";
import { getPresignedUploadUrl } from "@/lib/s3";
import { v4 as uuidv4 } from "uuid";
import { presignedUrlSchema } from "@/lib/validation";

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

        const { fileName, fileType, driveId, type } = result.data;

        const uniqueId = uuidv4();
        const safeFileName = fileName.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
        
        // Pick BUCKET and PREFIX based on TYPE
        const isJD = type === "JD";
        const isCert = type === "CERTIFICATION";
        
        const bucket = isJD 
            ? (process.env.R2_JDS_BUCKET || "jds")
            : isCert
                ? (process.env.R2_CERTIFICATIONS_BUCKET || "certifications")
                : (process.env.R2_RESUMES_BUCKET || "resumes");
        
        const prefix = isJD ? "jds/" : isCert ? "certifications/" : "resumes/";
        const key = `${prefix}drive_${driveId || 'unknown'}/${uniqueId}_${safeFileName}`;

        const uploadUrl = await getPresignedUploadUrl(bucket, key, fileType);
        
        // Pick PUBLIC DOMAIN based on TYPE
        let publicUrlBase = "";
        if (isJD) {
            publicUrlBase = process.env.NEXT_PUBLIC_R2_JDS_URL || "";
        } else if (isCert) {
            publicUrlBase = process.env.NEXT_PUBLIC_R2_CERTIFICATIONS_URL || "";
        } else {
            publicUrlBase = process.env.NEXT_PUBLIC_R2_RESUMES_URL || "";
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
