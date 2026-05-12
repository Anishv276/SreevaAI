import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { isInterviewTokenRequired } from "@/lib/interview-access";

const emailSchema = z.string().email("Valid email required");
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const email = session.email;
        if (!email) {
            return NextResponse.json({ error: "Session missing email identity" }, { status: 400 });
        }

        const applications = await prisma.application.findMany({
            where: { email: email.toLowerCase() },
            include: {
                drive: {
                    select: {
                        id: true,
                        title: true,
                        department: true,
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
                    accessToken: app.interview.accessToken,
                    expiresAt: app.interview.expiresAt,
                    canStart:
                        app.interview.status === "PENDING" &&
                        !!app.interview.expiresAt &&
                        new Date() < new Date(app.interview.expiresAt),
                    interviewLink: isInterviewTokenRequired()
                        ? `${appUrl}/interview/${app.id}?token=${encodeURIComponent(app.interview.accessToken)}`
                        : `${appUrl}/interview/${app.id}`,
                }
                : null;

            return {
                id: app.id,
                status: app.hiringStatus,
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
