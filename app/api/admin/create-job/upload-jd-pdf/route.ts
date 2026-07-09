import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { jdUploadQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { logJobError } from "@/lib/slack-error-logger";
export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const org = await prisma.organizationDetails.findUnique({ where: { id: session.orgId }, select: { name: true } });
        const orgName = org?.name || session.orgId;
        const contentLength = req.headers.get("content-length");
        console.log(`[API] Processing upload request. Header Content-Length: ${contentLength} bytes`);
        let formData: FormData;
        try {
            formData = await req.formData();
        } catch (parseError: any) {
            console.error("[UPLOAD_JD_PDF_PARSE_ERROR]", parseError);
            await logJobError({
                orgName,
                jobName: "JD Upload (pre-creation)",
                operation: "upload_jd",
                error: parseError.message || String(parseError),
                reason: "JD PDF form data parse failed — file too large or request interrupted",
            });
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
            contentType: "application/pdf",
            orgId: session.orgId,
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
        const session = await getSession().catch(() => null);
        await logJobError({
            orgName: session?.orgId || "unknown",
            jobName: "JD Upload (pre-creation)",
            operation: "upload_jd",
            error: error.message || String(error),
            reason: "JD upload enqueue to Redis queue failed",
        });
        return NextResponse.json({
            error: "Failed to enqueue JD upload task",
            details: error.message
        }, { status: 500 });
    }
}
