import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { jdUploadQueue } from "@/lib/queue";
export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const contentLength = req.headers.get("content-length");
        console.log(`[API] Processing upload request. Header Content-Length: ${contentLength} bytes`);
        let formData: FormData;
        try {
            formData = await req.formData();
        } catch (parseError: any) {
            console.error("[UPLOAD_JD_PDF_PARSE_ERROR]", parseError);
            return NextResponse.json({ 
                error: "Failed to parse upload data. The file might be too large or the request was interrupted.",
                details: parseError.message 
            }, { status: 400 });
        }
        const file = formData.get("file") as File;
        const fileName = formData.get("fileName") as string || `JD_${Date.now()}.pdf`;
        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }
        // 1. Prepare data for background upload
        const key = `assistant/${session.orgId}/${fileName}`;
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        // 2. Push to Redis Queue (Fire-and-forget)
        await jdUploadQueue.add('upload', {
            bucket: 'jds', // Using 'jds' bucket as per .env
            key,
            buffer,
            contentType: "application/pdf"
        }, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000
            }
        });
        // 3. Construct deterministic public URL immediately
        // This MUST match the logic in lib/s3.ts and use same .env vars
        const publicUrlBase = process.env.NEXT_PUBLIC_R2_JDS_URL || "";
        const publicUrl = `${publicUrlBase.replace(/\/$/, '')}/${key}`;
        console.log(`[API] JD Upload enqueued for ${key}. Predicted URL: ${publicUrl}`);
        // Return early to the frontend
        return NextResponse.json({ url: publicUrl, fileName });
    } catch (error: any) {
        console.error("[UPLOAD_JD_PDF_QUEUE_ERROR]", error);
        return NextResponse.json({ 
            error: "Failed to enqueue JD upload task",
            details: error.message 
        }, { status: 500 });
    }
}
