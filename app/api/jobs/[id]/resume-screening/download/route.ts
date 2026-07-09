import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeJobAccess } from "@/lib/job-access";
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: jobId } = await params;
        const access = await authorizeJobAccess(jobId);
        if (!access.ok) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }
        const { searchParams } = new URL(request.url);
        const candidateId = searchParams.get("candidateId");
        if (!candidateId) {
            return NextResponse.json({ error: "Missing candidateId" }, { status: 400 });
        }
        const candidate = await prisma.application.findUnique({
            where: { id: candidateId },
        });
        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
        }
        if (candidate.jobId !== jobId) {
            return NextResponse.json({ error: "Candidate not in this job" }, { status: 403 });
        }
        const resumeText = candidate.resumeText || "";
        const fileName = (candidate.fileName || candidateId).replace(".pdf", ".txt");
        return new NextResponse(resumeText, {
            status: 200,
            headers: {
                "Content-Type": "text/plain",
                "Content-Disposition": `attachment; filename="${fileName}"`,
            },
        });
    } catch (err) {
        console.error("[RESUME-DOWNLOAD] error:", err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
