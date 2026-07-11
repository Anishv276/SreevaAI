import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getRecordingUrl, normalizeRecordingState } from "@/lib/recording-state";
function buildSearchClause(query: string): Prisma.InterviewWhereInput {
    return {
        OR: [
            { id: { contains: query, mode: "insensitive" } },
            { applicationId: { contains: query, mode: "insensitive" } },
            { candidateFeedbackText: { contains: query, mode: "insensitive" } },
            {
                application: {
                    candidateFullName: { contains: query, mode: "insensitive" },
                },
            },
            {
                application: {
                    candidateEmail: { contains: query, mode: "insensitive" },
                },
            },
            {
                application: {
                    candidatePhone: { contains: query, mode: "insensitive" },
                },
            },
            {
                application: {
                    job: {
                        title: { contains: query, mode: "insensitive" },
                    },
                },
            },
            {
                application: {
                    job: {
                        jobRole: { contains: query, mode: "insensitive" },
                    },
                },
            },
            {
                application: {
                    job: {
                        organization: {
                            name: { contains: query, mode: "insensitive" },
                        },
                    },
                },
            },
            {
                application: {
                    job: {
                        organization: {
                            urlSlug: { contains: query, mode: "insensitive" },
                        },
                    },
                },
            },
        ],
    };
}
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }
        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
        const q = searchParams.get("q")?.trim() || "";
        const offset = (page - 1) * limit;
        const baseWhere: Prisma.InterviewWhereInput = {
            OR: [
                { candidateSelfRating: { not: Prisma.JsonNull } },
                { candidateFeedbackText: { not: null } },
            ],
        };
        const where: Prisma.InterviewWhereInput = q
            ? { AND: [baseWhere, buildSearchClause(q)] }
            : baseWhere;
        const notesWhere: Prisma.InterviewWhereInput = {
            AND: [
                where,
                { candidateFeedbackText: { not: null } },
                { candidateFeedbackText: { not: "" } },
            ],
        };
        const ratingWhere: Prisma.InterviewWhereInput = {
            AND: [
                where,
                { candidateSelfRating: { not: Prisma.JsonNull } },
            ],
        };
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayWhere: Prisma.InterviewWhereInput = {
            AND: [
                where,
                { interviewUpdatedAt: { gte: todayStart } },
            ],
        };
        const [total, feedbacks, withNotesCount, withRatingCount, todayCount] = await prisma.$transaction([
            prisma.interview.count({ where }),
            prisma.interview.findMany({
                where,
                orderBy: { interviewUpdatedAt: "desc" },
                skip: offset,
                take: limit,
                select: {
                    id: true,
                    applicationId: true,
                    interviewStatus: true,
                    interviewCompletedAt: true,
                    interviewUpdatedAt: true,
                    interviewCreatedAt: true,
                    durationInSeconds: true,
                    sessionRecording: true,
                    candidateFeedbackText: true,
                    candidateSelfRating: true,
                    application: {
                        select: {
                            id: true,
                            candidateFullName: true,
                            candidateEmail: true,
                            candidatePhone: true,
                            job: {
                                select: {
                                    id: true,
                                    title: true,
                                    jobRole: true,
                                    organization: {
                                        select: {
                                            id: true,
                                            name: true,
                                            urlSlug: true,
                                            billingPlan: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            prisma.interview.count({ where: notesWhere }),
            prisma.interview.count({ where: ratingWhere }),
            prisma.interview.count({ where: todayWhere }),
        ]);
        const normalizedFeedbacks = feedbacks.map((feedback: any) => {
            const recording = normalizeRecordingState(feedback.sessionRecording);
            return {
                ...feedback,
                interviewRecordingUrl: getRecordingUrl(recording),
                recordingStatus: recording.status || null,
                recordingCompletedAt: recording.completedAt || null,
            };
        });
        return NextResponse.json({
            feedbacks: normalizedFeedbacks,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
            stats: {
                total,
                withNotesCount,
                withRatingCount,
                todayCount,
            },
        });
    } catch (error) {
        console.error("Interview feedback fetch error:", error);
        return NextResponse.json({ error: "Failed to fetch interview feedback" }, { status: 500 });
    }
}
