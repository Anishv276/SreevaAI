import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInterviewTokenRequired } from "@/lib/interview-access";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { rating, feedback, interviewToken } = await request.json();
        const requireInterviewToken = isInterviewTokenRequired();

        if (typeof rating !== "number" || rating < 1 || rating > 5) {
            return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
        }

        // ── AUTHENTICATION ────────────────────────────────
        const interview = await prisma.interview.findFirst({
            where: {
                OR: [{ id: id }, { applicationId: id }]
            },
            select: { accessToken: true }
        });
        if (requireInterviewToken && (!interview || interview.accessToken !== interviewToken)) {
            return NextResponse.json({ error: "Unauthorized: Invalid feedback token" }, { status: 401 });
        }

        // We check both by ID and applicationId just in case, 
        // as the ID in the URL is the applicationId in this system's interview routes
        await prisma.interview.updateMany({
            where: {
                OR: [
                    { id: id },
                    { applicationId: id }
                ]
            },
            data: {
                candidateRating: rating,
                candidateFeedback: feedback || "",
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Feedback error:", error);
        return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }
}
