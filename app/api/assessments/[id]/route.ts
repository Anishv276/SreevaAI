import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const tokenFromUrl = searchParams.get('token');

        // @ts-ignore
        const assessment = await (prisma as any).assessment.findUnique({
            where: { id },
            include: {
                questions: {
                    orderBy: { order: 'asc' },
                },
                application: {
                    include: { drive: true }
                }
            }
        });

        if (!assessment) {
            return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
        }

        // 🛡️ SECURITY: Token Validation
        if (!tokenFromUrl || tokenFromUrl !== (assessment as any).accessToken) {
            return NextResponse.json({ error: "Invalid or missing access token" }, { status: 401 });
        }

        // 🛡️ SECURITY: Expiration Check
        if ((assessment as any).expiresAt && new Date() > new Date((assessment as any).expiresAt)) {
            return NextResponse.json({ error: "Assessment link has expired" }, { status: 403 });
        }

        if ((assessment as any).completedAt || (assessment as any).status === "COMPLETED") {
            return NextResponse.json({ error: "Assessment already completed" }, { status: 403 });
        }



        // Only return necessary fields to the candidate
        return NextResponse.json({
            id: assessment.id,
            drive: {
                title: assessment.application.drive.title,
                proctoringEnabled: assessment.application.drive.proctoringEnabled,
                webcamMonitoring: assessment.application.drive.webcamMonitoring,
                assessmentMode: assessment.application.drive.assessmentMode,
                // Time limit in minutes — fallback to 22 minutes if not set
                timeLimitMinutes: assessment.application.drive.timeLimitMinutes || 22,
            },
            questions: assessment.questions.map((q: any) => ({
                id: q.id,
                text: q.text,
                type: q.type,
                options: q.options ? JSON.parse(q.options) : null
            }))
        });

    } catch (error) {
        console.error("[ASSESSMENT GET ERROR]:", error);
        return NextResponse.json({ error: "Failed to fetch assessment" }, { status: 500 });
    }
}



export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const tokenFromUrl = searchParams.get('token');

        // @ts-ignore
        const assessment = await (prisma as any).assessment.findUnique({
            where: { id }
        });

        if (!assessment) {
            return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
        }

        // 🛡️ SECURITY: Token Validation
        if (!tokenFromUrl || tokenFromUrl !== (assessment as any).accessToken) {
            return NextResponse.json({ error: "Invalid or missing access token" }, { status: 401 });
        }

        // 🛡️ SECURITY: Expiration Check
        if ((assessment as any).expiresAt && new Date() > new Date((assessment as any).expiresAt)) {
            return NextResponse.json({ error: "Assessment link has expired" }, { status: 403 });
        }

        if ((assessment as any).status === "COMPLETED") {
            return NextResponse.json({ error: "Assessment already completed" }, { status: 403 });
        }

        // Only update startedAt and status if it hasn't been set yet
        if (!(assessment as any).startedAt || (assessment as any).status === "PENDING") {
            // @ts-ignore
            await (prisma as any).assessment.update({
                where: { id },
                data: { 
                    startedAt: new Date(),
                    status: "STARTED"
                }
            });
        }



        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("[ASSESSMENT START ERROR]:", error);
        return NextResponse.json({ error: "Failed to start assessment" }, { status: 500 });
    }
}
