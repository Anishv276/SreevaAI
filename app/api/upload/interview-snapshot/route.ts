import { NextResponse } from "next/server";
import { putObject } from "@/lib/s3";
import { prisma } from "@/lib/prisma";

function buildCandidateRoleFolder(fullName?: string | null, roleTitle?: string | null, fallbackName?: string) {
    const raw = [fullName, roleTitle].filter(Boolean).join(" - ") || fallbackName || "candidate";
    return raw
        .replace(/[^a-zA-Z0-9_\- ]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .toLowerCase();
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { imageDataUrl, candidateName, applicationId, label } = body;
        console.log(`[SNAPSHOT_API] Request for AppID: ${applicationId}, Candidate: ${candidateName}`);

        if (!imageDataUrl || !applicationId) {
            return NextResponse.json({ error: "Missing imageDataUrl or applicationId" }, { status: 400 });
        }

        // Strip base64 prefix: "data:image/jpeg;base64,..."
        const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        const application = await prisma.application.findUnique({
            where: { id: String(applicationId) },
            select: {
                fullName: true,
                drive: { select: { title: true } },
            },
        });

        // Folder: candidates/{candidate name - role}/snapshots/
        const safeName = buildCandidateRoleFolder(
            application?.fullName,
            application?.drive?.title,
            candidateName || applicationId
        );

        const timestamp = Date.now();
        const snapshotLabel = label || "snapshot";
        const key = `candidates/${safeName}/snapshots/${snapshotLabel}_${timestamp}.jpg`;

        const bucket = process.env.R2_INTERVIEW_BUCKET || "interview";
        const url = await putObject(bucket, key, buffer, "image/jpeg");

        // Save to database
        await prisma.interview.upsert({
            where: { applicationId: String(applicationId) },
            update: {
                snapshots: {
                    push: url
                }
            },
            create: {
                applicationId: String(applicationId),
                snapshots: [url],
                status: "PENDING"
            }
        });

        const responseBody = { url, key };
        console.log(`[SNAPSHOT] Returning response:`, responseBody);
        return NextResponse.json(responseBody);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[SNAPSHOT_UPLOAD_ERROR]:", message);
        return NextResponse.json({ error: "Failed to upload snapshot" }, { status: 500 });
    }
}
