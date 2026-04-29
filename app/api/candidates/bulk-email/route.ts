import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendApplicationStatusEmail } from "@/lib/mail";
import { generateId } from "@/lib/ids";
import { isInterviewTokenRequired } from "@/lib/interview-access";

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const orgId = session.orgId;
        if (!orgId) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const {
            ids,
            emailType = "screening",
            targetAction,
        }: {
            ids: string[];
            emailType?: "screening" | "hiring";
            targetAction?: "shortlist" | "reject" | "hire" | "nothired";
        } = await request.json();

        if (!ids?.length) {
            return NextResponse.json({ error: "ids are required" }, { status: 400 });
        }

        const applications = await prisma.application.findMany({
            where: { id: { in: ids }, drive: { orgId } },
            select: {
                id: true,
                fullName: true,
                email: true,
                resumeStatus: true,
                hiringStatus: true,
                drive: { select: { id: true, title: true, orgId: true } },
                interview: { select: { accessToken: true } },
            },
        });

        if (!applications.length) {
            return NextResponse.json({ error: "No matching candidates found" }, { status: 404 });
        }

        const careersUrl = process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL}/careers`
            : "https://sreeva.ai/careers";

        let sent = 0;
        let skipped = 0;
        const skipReasons: string[] = [];

        await Promise.allSettled(
            applications.map(async (app: (typeof applications)[number]) => {
                try {
                    if (!app.email) {
                        console.warn(`[bulk-email] Skipping ${app.id} — no email address`);
                        skipped++;
                        skipReasons.push(`${app.fullName || app.id}: Missing email address`);
                        return;
                    }

                    const resumeStatus = (app.resumeStatus || "").toLowerCase().trim();
                    const hiringStatus = (app.hiringStatus || "").toLowerCase().trim();

                    let action: "shortlist" | "reject" | "hire" | "nothired" | null = null;

                    // 1. If explicit targetAction provided from frontend, use it
                    if (targetAction) {
                        action = targetAction;
                    } 
                    // 2. Otherwise route based on internal DB status
                    else if (emailType === "hiring") {
                        if (hiringStatus === "hired" || hiringStatus === "hire") {
                            action = "hire";
                        } else if (
                            hiringStatus === "not hired" ||
                            hiringStatus === "nothired" ||
                            hiringStatus === "not shortlisted" ||
                            hiringStatus === "rejected"
                        ) {
                            action = "nothired";
                        }
                    } else {
                        // screening
                        if (resumeStatus === "shortlisted" || resumeStatus === "shortlist") {
                            action = "shortlist";
                        } else if (resumeStatus === "rejected" || resumeStatus === "reject") {
                            action = "reject";
                        }
                    }

                    if (!action) {
                        console.warn(`[bulk-email] Skipping ${app.id} — resolved action is empty.`);
                        skipped++;
                        const currentStatus = emailType === "hiring" ? `Hiring: ${app.hiringStatus || 'None'}` : `Resume: ${app.resumeStatus || 'None'}`;
                        skipReasons.push(`${app.fullName || app.email}: Cannot send email for status '${currentStatus}'. Please shortlist/reject first.`);
                        return;
                    }

                    if (action === "shortlist") {
                        const interview = await (prisma as any).interview.upsert({
                            where: { applicationId: app.id },
                            update: {
                                expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
                                status: "PENDING",
                            },
                            create: {
                                id: generateId("int", app.fullName || app.id),
                                applicationId: app.id,
                                expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
                                status: "PENDING",
                            },
                        });
                        const interviewBase = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/interview/${app.id}`;
                        const interviewLink = isInterviewTokenRequired()
                            ? `${interviewBase}?token=${interview.accessToken}`
                            : interviewBase;
                        await sendApplicationStatusEmail({
                            email: app.email,
                            fullName: app.fullName,
                            jobTitle: app.drive.title,
                            orgId: app.drive.orgId ?? undefined,
                            status: "SHORTLISTED",
                            score: 0,
                            interviewLink,
                        });
                        sent++;

                    } else if (action === "reject") {
                        await sendApplicationStatusEmail({
                            email: app.email,
                            fullName: app.fullName,
                            jobTitle: app.drive.title,
                            orgId: app.drive.orgId ?? undefined,
                            status: "REJECTED",
                            score: 0,
                            interviewLink: careersUrl,
                        });
                        sent++;

                    } else if (action === "hire") {
                        await sendApplicationStatusEmail({
                            email: app.email,
                            fullName: app.fullName,
                            jobTitle: app.drive.title,
                            orgId: app.drive.orgId ?? undefined,
                            status: "Hired",
                            score: 0,
                        });
                        sent++;

                    } else if (action === "nothired") {
                        await sendApplicationStatusEmail({
                            email: app.email,
                            fullName: app.fullName,
                            jobTitle: app.drive.title,
                            orgId: app.drive.orgId ?? undefined,
                            status: "REJECTED",
                            score: 0,
                            interviewLink: careersUrl,
                        });
                        sent++;
                    }

                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    console.error(`[bulk-email] Failed for ${app.id}:`, msg);
                    skipped++;
                    skipReasons.push(`${app.fullName || app.email}: ${msg}`);
                }
            })
        );

        let msg = `Emails sent to ${sent} candidate${sent !== 1 ? "s" : ""}`;
        if (skipped > 0) {
            const firstReason = skipReasons[0] || "Unknown status condition";
            msg = `Emails sent: ${sent}, skipped: ${skipped} (${firstReason})`;
        }

        return NextResponse.json({ message: msg, sent, skipped, reasons: skipReasons });
    } catch (error) {
        console.error("[bulk-email] error:", error);
        return NextResponse.json({ error: "Failed to send emails" }, { status: 500 });
    }
}
