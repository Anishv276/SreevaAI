import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendApplicationStatusEmail } from "@/lib/mail";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id: applicationId } = await context.params;

        if (!applicationId) {
            console.error("[RESEND] Missing applicationId in params");
            return NextResponse.json({ error: "Application ID required" }, { status: 400 });
        }

        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: { 
                drive: true,
                interview: true
            }
        });

        if (!application) {
            console.error(`[RESEND] Application not found for ID: ${applicationId}`);
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }

        const appStatus = (application.status || "").toUpperCase();
        if (appStatus !== "SHORTLISTED" && appStatus !== "ACCEPTED") {
            console.error(`[RESEND] Status mismatch. Expected SHORTLISTED/ACCEPTED, got: ${appStatus}`);
            return NextResponse.json({ 
                error: `Only shortlisted candidates can have their interview link resent. Current status is "${application.status}"` 
            }, { status: 400 });
        }

        const newToken = uuidv4();
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

        if (application.interview) {
            await prisma.interview.update({
                where: { id: application.interview.id },
                data: {
                    accessToken: newToken,
                    expiresAt: expiresAt,
                    status: "PENDING",
                    startedAt: null,
                    completedAt: null,
                }
            });
        } else {
            await prisma.interview.create({
                data: {
                    applicationId: applicationId,
                    accessToken: newToken,
                    expiresAt: expiresAt,
                    status: "PENDING",
                }
            });
        }

        const interviewLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/careers/interview/${applicationId}?token=${newToken}`;

        await sendApplicationStatusEmail({
            email: application.email,
            fullName: application.fullName,
            jobTitle: application.drive?.title || "Unknown Role",
            status: "ACCEPTED",
            score: application.aiScore || 0,
            interviewLink
        });

        return NextResponse.json({ 
            success: true, 
            message: "Interview link resent successfully",
            expiresAt: expiresAt.toISOString()
        });

    } catch (error) {
        console.error("[RESEND INTERVIEW ERROR]:", error);
        return NextResponse.json({ error: "Failed to resend interview link" }, { status: 500 });
    }
}
