import { NextRequest, NextResponse } from "next/server";
import fs from "fs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let filePath = "";
    
    // We serve the generated 3D assets from the artifacts directory
    if (id === "tech") {
        filePath = "C:\\Users\\vamsi\\.gemini\\antigravity-ide\\brain\\462eec02-08ac-4323-9b1f-683463277968\\tech_shape_1784473112155.png";
    } else if (id === "conv") {
        filePath = "C:\\Users\\vamsi\\.gemini\\antigravity-ide\\brain\\462eec02-08ac-4323-9b1f-683463277968\\conv_shape_1784473131465.png";
    }

    if (!filePath || !fs.existsSync(filePath)) {
        return new NextResponse("Not found", { status: 404 });
    }

    const file = fs.readFileSync(filePath);
    return new NextResponse(file, {
        headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
}
