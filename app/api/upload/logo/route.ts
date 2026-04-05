import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSession } from "@/lib/auth";

const s3Client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
});

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;
        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const key = `org_${session.orgId}_${Date.now()}_${file.name}`;
        
        // Target your "logos" bucket explicitly
        const BUCKET_NAME = "logos";

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: file.type,
        }));

        // RESOLUTION: Use the specialized logo host if provided, fallback to default R2 URL
        const host = process.env.NEXT_PUBLIC_LOGO_URL || process.env.NEXT_PUBLIC_R2_URL;
        const baseUrl = host?.replace(/\/$/, "");
        const publicUrl = `${baseUrl}/${key}`;

        return NextResponse.json({ url: publicUrl });
    } catch (error) {
        console.error("R2 Upload Error:", error);
        return NextResponse.json({ error: "Cloudflare Dispatch Failed" }, { status: 500 });
    }
}
