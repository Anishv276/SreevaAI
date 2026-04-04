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

        const { fileName, fileType, driveId } = result.data;

        const uniqueId = uuidv4();
        const safeFileName = fileName.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
        const key = `resumes/drive_${driveId || 'unknown'}/${uniqueId}_${safeFileName}`;

        const uploadUrl = await getPresignedUploadUrl(key, fileType);
        
        const publicUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`;

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
