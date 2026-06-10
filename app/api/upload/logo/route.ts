import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

        // -- SIZE VALIDATION (5MB) -------------------------
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: "File too large. Maximum size is 5MB" }, { status: 413 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // -- MAGIC NUMBER VALIDATION ------------------------
        const magicNumbers = {
            png: [0x89, 0x50, 0x4e, 0x47],
            jpg: [0xff, 0xd8, 0xff],
            gif: [0x47, 0x49, 0x46, 0x38],
            webp: [0x52, 0x49, 0x46, 0x46], // "RIFF" header
        };

        const isPNG = magicNumbers.png.every((b, i) => buffer[i] === b);
        const isJPG = magicNumbers.jpg.every((b, i) => buffer[i] === b);
        const isGIF = magicNumbers.gif.every((b, i) => buffer[i] === b);
        const isWEBP = magicNumbers.webp.every((b, i) => buffer[i] === b) && 
                       buffer.slice(8, 12).toString() === "WEBP";

        if (!isPNG && !isJPG && !isGIF && !isWEBP) {
            return NextResponse.json({ error: "Invalid file type. Only PNG, JPG, GIF, and WEBP are allowed." }, { status: 400 });
        }

        const key = `logo_${session.orgId}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        
        // Target your "logos" bucket explicitly
        const BUCKET_NAME = process.env.R2_LOGOS_BUCKET || "logos";

        const { putObject } = await import("@/lib/s3");
        // Use the validated type or stay with file.type but strictly within our whitelist
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
        const expectedPrefix = `logo_${session.orgId}_`;
        if (!key.startsWith(expectedPrefix)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const org = await prisma.organization.findUnique({
            where: { id: session.orgId },
            select: { logoUrl: true },
        });
        if (org?.logoUrl && org.logoUrl !== url) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const BUCKET_NAME = process.env.R2_LOGOS_BUCKET || "logos";
        await deleteObject(BUCKET_NAME, key);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("R2 Delete Error:", error);
        return NextResponse.json({ error: "Cloudflare Eviction Failed" }, { status: 500 });
    }
}
