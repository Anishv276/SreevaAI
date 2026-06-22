import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole } from "@/lib/auth";
import { generateId } from "@/lib/ids";
import { sendInterviewInviteEmail } from "@/lib/mail";
import { buildInterviewLink } from "@/lib/interview-links";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { resumeQueue } from "@/lib/queue";

// POST /api/admin/interview-only
// Interview Only mode — two paths:
//   • No resume  → create candidate, send invite immediately
//   • Resume URL → create candidate with resumeStatus="waiting", enqueue screening,
//                   worker auto-sends invite after scoring is done
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { driveId, candidates } = body as {
            driveId: string;
            candidates: { fullName: string; email: string; phone: string; resumeUrl?: string }[];
        };

        if (!driveId || !Array.isArray(candidates) || candidates.length === 0) {
            return NextResponse.json({ error: "driveId and candidates[] required" }, { status: 400 });
        }

        const orgId = session.orgId;
        if (!orgId) return NextResponse.json({ error: "No org" }, { status: 403 });

        const drive = await prisma.drive.findUnique({
            where: { id: driveId },
            include: { organization: { select: { name: true } } },
        });
        if (!drive || drive.orgId !== orgId) {
            return NextResponse.json({ error: "Drive not found" }, { status: 404 });
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.sreevaai.com";
        const tokenRequired = isInterviewTokenRequired();

        const results: { id: string; email: string; name: string; sent: boolean; queued: boolean }[] = [];

        for (const candidate of candidates) {
            const { fullName, email, phone, resumeUrl } = candidate;
            if (!fullName || !email) continue;

            const appId = generateId("app", fullName);
            const hasResume = !!resumeUrl;

            await prisma.application.create({
                data: {
                    id: appId,
                    fullName,
                    email,
                    phone: phone || "",
                    resumeUrl: resumeUrl || "",
                    driveId,
                    resumeStatus: hasResume ? "waiting" : "skipped",
                    interviewStatus: "pending",
                    hiringStatus: "pending",
                },
            });

            if (hasResume) {
                // Enqueue an individual screening job immediately.
                // The worker processes it as soon as a concurrency slot is free.
                await resumeQueue.add(
                    "screen-resume",
                    {
                        applicationId: appId,
                        bucket: process.env.R2_RESUMES_BUCKET || "resumes",
                        key: new URL(resumeUrl).pathname.replace(/^\//, ""),
                        fileName: resumeUrl.split("/").pop() || "resume.pdf",
                        orgId,
                    },
                    { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
                ).catch((err) => {
                    console.error(`[interview-only] Failed to enqueue screening job for ${appId}:`, err);
                });
                results.push({ id: appId, email, name: fullName, sent: false, queued: true });
            } else {
                // No resume → create Interview record and send invite immediately
                const interviewId = generateId("ivw", fullName);
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7);

                await prisma.interview.create({
                    data: {
                        id: interviewId,
                        applicationId: appId,
                        inviteSentAt: new Date(),
                        expiresAt,
                        status: "PENDING",
                    },
                });

                const interview = await prisma.interview.findUnique({
                    where: { applicationId: appId },
                    select: { accessToken: true },
                });

                const interviewLink = buildInterviewLink(baseUrl, appId, {
                    token: tokenRequired ? interview?.accessToken : null,
                    orgName: drive.organization?.name,
                });

                let sent = false;
                try {
                    await sendInterviewInviteEmail({
                        email,
                        fullName,
                        jobTitle: drive.title,
                        interviewLink,
                        orgName: drive.organization?.name || "The Company",
                    });
                    sent = true;
                } catch (e) {
                    console.error(`[interview-only] Failed to send email to ${email}:`, e);
                }

                results.push({ id: appId, email, name: fullName, sent, queued: false });
            }
        }


        return NextResponse.json({ success: true, results });
    } catch (err) {
        console.error("[interview-only] POST error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
