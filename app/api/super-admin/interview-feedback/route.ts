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
            { candidateFeedback: { contains: query, mode: "insensitive" } },
            {
                application: {
                    fullName: { contains: query, mode: "insensitive" },
                },
            },
            {
                application: {
                    email: { contains: query, mode: "insensitive" },
                },
            },
            {
                application: {
                    phone: { contains: query, mode: "insensitive" },
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
                        role: { contains: query, mode: "insensitive" },
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
                { candidateRating: { not: Prisma.JsonNull } },
                { candidateFeedback: { not: null } },
            ],
        };
        const where: Prisma.InterviewWhereInput = q
            ? { AND: [baseWhere, buildSearchClause(q)] }
            : baseWhere;
        const notesWhere: Prisma.InterviewWhereInput = {
            AND: [
                where,
                { candidateFeedback: { not: null } },
                { candidateFeedback: { not: "" } },
            ],
        };
        const ratingWhere: Prisma.InterviewWhereInput = {
            AND: [
                where,
                { candidateRating: { not: Prisma.JsonNull } },
            ],
        };
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayWhere: Prisma.InterviewWhereInput = {
            AND: [
                where,
                { updatedAt: { gte: todayStart } },
            ],
        };
        const [total, feedbacks, withNotesCount, withRatingCount, todayCount] = await prisma.$transaction([
            prisma.interview.count({ where }),
            prisma.interview.findMany({
                where,
                orderBy: { updatedAt: "desc" },
                skip: offset,
                take: limit,
                select: {
                    id: true,
                    applicationId: true,
                    status: true,
                    completedAt: true,
                    updatedAt: true,
                    createdAt: true,
                    interviewDuration: true,
                    recording: true,
                    candidateFeedback: true,
                    candidateRating: true,
                    application: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                            phone: true,
                            job: {
                                select: {
                                    id: true,
                                    title: true,
                                    role: true,
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
            const recording = normalizeRecordingState(feedback.recording);
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
