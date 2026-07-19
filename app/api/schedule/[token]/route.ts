import { NextResponse } from "next/server";
import { prisma, isLive } from "@/lib/prisma";
import { sendInterviewScheduledEmail } from "@/lib/mail";
import { briefGenerationQueue } from "@/lib/queue";

const SLOT_DURATION_MS = 30 * 60 * 1000; // 30-min slots
const TIMEZONE = "Asia/Kolkata";

// Generate 30-min slots for a given day (12 AM – 11:59 PM IST), returning UTC Date objects
function generateSlots(dateIST: string): Date[] {
    const slots: Date[] = [];
    // dateIST is YYYY-MM-DD in IST
    for (let hour = 0; hour < 24; hour++) {
        for (const minute of [0, 30]) {
            // Build ISO string as IST then convert
            const localStr = `${dateIST}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
            // Parse as IST by using Intl -- simpler: offset IST = UTC+5:30
            const utcMs = new Date(localStr + "+05:30").getTime();
            slots.push(new Date(utcMs));
        }
    }
    return slots;
}

// GET /api/schedule/[token]?date=YYYY-MM-DD
// Returns: interview info + available slots for the given date
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    const url = new URL(_req.url);
    const dateIST = url.searchParams.get("date"); // YYYY-MM-DD in IST

    const interview = await prisma.interview.findUnique({
        where: { candidateInviteToken: token },
        include: {
            application: {
                include: {
                    job: {
                        include: { organization: { select: { id: true, name: true, maxConcurrentInterviews: true, isDeleted: true } } },
                    },
                },
            },
        },
    });

    if (!interview || !isLive(interview.application, interview.application?.job, interview.application?.job?.organization)) {
        return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    if (interview.interviewScheduledAt) {
        return NextResponse.json({ error: "Slot already booked", alreadyBooked: true, scheduledAt: interview.interviewScheduledAt }, { status: 409 });
    }
    if (["COMPLETED", "LAUNCHING", "PROGRESS"].includes(interview.interviewStatus)) {
        return NextResponse.json({ error: "Interview already started or completed" }, { status: 409 });
    }

    const org = interview.application.job?.organization;
    const maxSlots = org?.maxConcurrentInterviews ?? 5;

    const result: { info: object; deadline?: string; slots?: string[] } = {
        info: {
            candidateName: interview.application.candidateFullName,
            jobTitle: interview.application.job?.jobRole || interview.application.job?.title,
            orgName: org?.name,
            duration: 20,
            slotDuration: 30,
            timezone: TIMEZONE,
        },
    };

    if (interview.application.job?.applicationDeadline) {
        result.deadline = interview.application.job.applicationDeadline.toISOString();
    }

    if (dateIST) {
        const job = interview.application.job;
        const deadlineMs = job?.applicationDeadline ? job.applicationDeadline.getTime() : null;
        const dateMs = new Date(dateIST + "T23:59:59+05:30").getTime(); // End of day in IST

        // If deadline is before this date, no slots available
        if (deadlineMs && deadlineMs < dateMs) {
            result.slots = [];
            return NextResponse.json(result);
        }

        // Only show slots that are at least 5 minutes from now
        const allSlots = generateSlots(dateIST).filter(s => s.getTime() > Date.now() + 5 * 60 * 1000);

        // Count booked interviews per slot window for this org
        const orgId = org?.id;
        const bookedCounts = await prisma.interview.groupBy({
            by: ["interviewScheduledAt"],
            where: {
                interviewScheduledAt: { not: null },
                isDeleted: false,
                application: { job: { organizationId: orgId } },
            },
            _count: { interviewScheduledAt: true },
        });
        const countMap = new Map<number, number>();
        for (const b of bookedCounts) {
            if (b.interviewScheduledAt) countMap.set(b.interviewScheduledAt.getTime(), b._count.interviewScheduledAt);
        }

        const available = allSlots.filter(s => (countMap.get(s.getTime()) ?? 0) < maxSlots);
        result.slots = available.map(s => s.toISOString());
    }

    return NextResponse.json(result);
}

// POST /api/schedule/[token]
// Body: { slotISO: string }  -- books the slot and sends interview link email
export async function POST(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    const { slotISO } = await req.json();
    if (!slotISO) return NextResponse.json({ error: "slotISO required" }, { status: 400 });

    const slotDate = new Date(slotISO);
    if (isNaN(slotDate.getTime()) || slotDate.getTime() < Date.now()) {
        return NextResponse.json({ error: "Invalid or past slot" }, { status: 400 });
    }

    const interview = await prisma.interview.findUnique({
        where: { candidateInviteToken: token },
        include: {
            application: {
                include: {
                    job: {
                        include: { organization: { select: { name: true, maxConcurrentInterviews: true, id: true, isDeleted: true } } },
                    },
                },
            },
        },
    });

    if (!interview || !isLive(interview.application, interview.application?.job, interview.application?.job?.organization)) {
        return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    if (interview.interviewScheduledAt) return NextResponse.json({ error: "Already booked", alreadyBooked: true }, { status: 409 });

    const org = interview.application.job?.organization;
    const maxSlots = org?.maxConcurrentInterviews ?? 5;
    const orgId = org?.id;

    // Atomic concurrency check: count how many interviews share this exact slot for the org
    const count = await prisma.interview.count({
        where: {
            interviewScheduledAt: slotDate,
            isDeleted: false,
            application: { job: { organizationId: orgId } }
        },
    });
    if (count >= maxSlots) {
        return NextResponse.json({ error: "Slot full, please pick another", slotFull: true }, { status: 409 });
    }

    // Book the slot
    await prisma.interview.update({
        where: { id: interview.id },
        data: { interviewScheduledAt: slotDate, interviewTimezone: TIMEZONE, interviewStatus: "SCHEDULED" },
    });

    // Enqueue background brief generation (slot flow only — NOT for test interviews)
    // The worker fetches resume + JD fresh from DB, generates the LLM brief, and
    // saves it to Interview.aiInterviewBrief so agent_runtime loads it instantly at launch.
    void briefGenerationQueue.add("generate-brief", {
        applicationId: interview.applicationId,
    }).catch((err) => {
        console.error("[BRIEF] Failed to enqueue brief-generation job:", err);
        // Non-fatal: agent_runtime will fall back to live generation
    });

    // Build interview link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sreevaai.com";
    const interviewLink = `${appUrl}/interview/${interview.applicationId}?token=${interview.candidateInviteToken}`;

    // Send confirmation email with interview link
    await sendInterviewScheduledEmail({
        email: interview.application.candidateEmail,
        fullName: interview.application.candidateFullName,
        jobTitle: interview.application.job?.jobRole || interview.application.job?.title || "Interview",
        orgName: org?.name || "The Organization",
        interviewLink,
        scheduledAt: slotDate,
        timezone: TIMEZONE,
    });

    return NextResponse.json({ success: true, scheduledAt: slotDate.toISOString() });
}
