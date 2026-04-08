import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const emailSchema = z.string().email("Valid email required");

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const email = searchParams.get("email");

        const result = emailSchema.safeParse(email);
        if (!result.success) {
            return NextResponse.json(
                { error: "Valid email is required" },
                { status: 400 }
            );
        }

        const applications = await prisma.application.findMany({
            where: { email: result.data.toLowerCase() },
            include: {
                drive: {
                    select: {
                        id: true,
                        title: true,
                        department: true,
                        location: true,
                        workMode: true,
                        type: true,
                        salary: true,
                    }
                },
                interview: {
                    select: {
                        id: true,
                        status: true,
                        accessToken: true,
                        expiresAt: true,
                        startedAt: true,
                        completedAt: true,
                        interviewDuration: true,
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        });

        const formattedApplications = applications.map((app) => {
            const interviewStage = app.interview
                ? {
                    status: app.interview.status,
                    token: app.interview.accessToken,
                    expiresAt: app.interview.expiresAt,
                    canStart:
                        app.interview.status === "PENDING" &&
                        !!app.interview.expiresAt &&
                        new Date() < new Date(app.interview.expiresAt),
                }
                : null;

            return {
                id: app.id,
                status: app.status,
                score: app.aiScore,
                createdAt: app.createdAt,
                drive: app.drive,
                interview: interviewStage,
            };
        });

        return NextResponse.json(formattedApplications);
    } catch (error) {
        console.error("[CANDIDATE DASHBOARD ERROR]:", error);
        return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
    }
}
