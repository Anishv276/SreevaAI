import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

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
        const key = `logo_${session.orgId}_${Date.now()}_${file.name}`;
        
        // Target your "logos" bucket explicitly
        const BUCKET_NAME = process.env.R2_LOGOS_BUCKET || "logos";

        const { putObject } = await import("@/lib/s3");
        const publicUrl = await putObject(BUCKET_NAME, key, buffer, file.type);

        return NextResponse.json({ url: publicUrl });
    } catch (error) {
        console.error("R2 Upload Error:", error);
        return NextResponse.json({ error: "Cloudflare Dispatch Failed" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { url } = await req.json();
        if (!url) return NextResponse.json({ error: "No URL provided" }, { status: 400 });

        const { deleteObject, getKeyFromUrl } = await import("@/lib/s3");
        const key = getKeyFromUrl(url);

        if (!key) return NextResponse.json({ error: "Invalid key" }, { status: 400 });

        const BUCKET_NAME = process.env.R2_LOGOS_BUCKET || "logos";
        await deleteObject(BUCKET_NAME, key);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("R2 Delete Error:", error);
        return NextResponse.json({ error: "Cloudflare Eviction Failed" }, { status: 500 });
    }
}