import { NextResponse } from "next/server";
import { putObject } from "@/lib/s3";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { imageDataUrl, candidateName, applicationId, label } = body;

        if (!imageDataUrl || !applicationId) {
            return NextResponse.json({ error: "Missing imageDataUrl or applicationId" }, { status: 400 });
        }

        // Strip base64 prefix: "data:image/jpeg;base64,..."
        const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        // Folder: candidates/{candidateName or applicationId}/
        const safeName = (candidateName || applicationId)
            .replace(/[^a-zA-Z0-9_\- ]/g, "")
            .trim()
            .replace(/\s+/g, "_")
            .toLowerCase();

        const timestamp = Date.now();
        const snapshotLabel = label || "snapshot";
        const key = `candidates/${safeName}/${snapshotLabel}_${timestamp}.jpg`;

        const bucket = process.env.R2_INTERVIEW_BUCKET || "interview";
        const url = await putObject(bucket, key, buffer, "image/jpeg");

        console.log(`[SNAPSHOT] Saved: ${key} → ${url}`);
        return NextResponse.json({ url, key });
    } catch (error: any) {
        console.error("[SNAPSHOT_UPLOAD_ERROR]:", error.message);
        return NextResponse.json({ error: "Failed to upload snapshot" }, { status: 500 });
    }
}
