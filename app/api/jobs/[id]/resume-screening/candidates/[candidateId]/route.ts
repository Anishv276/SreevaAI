import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeJobAccess } from "@/lib/job-access";
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string; candidateId: string }> }
) {
    try {
        const { id: jobId, candidateId } = await params;
        const access = await authorizeJobAccess(jobId);
        if (!access.ok) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }
        const { resumeStatus } = await request.json();
        if (!resumeStatus || !["SHORTLISTED", "REJECTED"].includes(resumeStatus)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
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
        const updated = await prisma.application.update({
            where: { id: candidateId },
            data: { resumeStatus },
        });
        return NextResponse.json(updated);
    } catch (err) {
        console.error("[RESUME-SCREENING] PATCH error:", err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string; candidateId: string }> }
) {
    try {
        const { id: jobId, candidateId } = await params;
        const access = await authorizeJobAccess(jobId);
        if (!access.ok) {
            return NextResponse.json({ error: access.error }, { status: access.status });
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
        await prisma.application.update({
            where: { id: candidateId },
            data: { isDeleted: true }
        });
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[RESUME-SCREENING] DELETE error:", err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
