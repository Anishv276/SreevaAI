import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string; candidateId: string }> }
) {
    try {
        const { id: driveId, candidateId } = await params;
        const { resumeStatus } = await request.json();

        if (!resumeStatus || !["SHORTLISTED", "REJECTED"].includes(resumeStatus)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        const candidate = await prisma.resumeCandidate.findUnique({
            where: { id: candidateId },
        });

        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
        }

        if (candidate.driveId !== driveId) {
            return NextResponse.json({ error: "Candidate not in this drive" }, { status: 403 });
        }

        const updated = await prisma.resumeCandidate.update({
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
        const { id: driveId, candidateId } = await params;

        const candidate = await prisma.resumeCandidate.findUnique({
            where: { id: candidateId },
        });

        if (!candidate) {
            return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
        }

        if (candidate.driveId !== driveId) {
            return NextResponse.json({ error: "Candidate not in this drive" }, { status: 403 });
        }

        await prisma.resumeCandidate.delete({
            where: { id: candidateId },
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[RESUME-SCREENING] DELETE error:", err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
