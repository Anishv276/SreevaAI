import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: driveId } = await params;
        const { searchParams } = new URL(request.url);
        const candidateId = searchParams.get("candidateId");

        if (!candidateId) {
            return NextResponse.json({ error: "Missing candidateId" }, { status: 400 });
        }

        const candidate = await prisma.resumeCandidate.findUnique({
            where: { id: candidateId },
            include: { drive: true },
        });

        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
        }

        if (candidate.driveId !== driveId) {
            return NextResponse.json({ error: "Candidate not in this drive" }, { status: 403 });
        }

        // Return the resume text as a downloadable file
        const resumeText = candidate.resumeText || "";
        return new NextResponse(resumeText, {
            status: 200,
            headers: {
                "Content-Type": "text/plain",
                "Content-Disposition": `attachment; filename="${candidate.fileName.replace(".pdf", ".txt")}"`,
            },
        });
    } catch (err) {
        console.error("[RESUME-DOWNLOAD] error:", err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
