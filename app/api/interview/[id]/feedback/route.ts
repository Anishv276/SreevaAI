import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInterviewTokenRequired } from "@/lib/interview-access";
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const rating = body.rating ?? body.ratingData;
        const feedback = body.feedback ?? body.notes;
        const { interviewToken } = body;
        const requireInterviewToken = isInterviewTokenRequired();
        // -- AUTHENTICATION --------------------------------
        const interview = await prisma.interview.findFirst({
            where: {
                OR: [{ id: id }, { applicationId: id }]
            },
            select: { candidateInviteToken: true }
        });
        if (requireInterviewToken && (!interview || interview.candidateInviteToken !== interviewToken)) {
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
                candidateSelfRating: rating && typeof rating === "object" && !Array.isArray(rating) ? rating : {},
                candidateFeedbackText: typeof feedback === "string" ? feedback : "",
            },
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Feedback error:", error);
        return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }
}
