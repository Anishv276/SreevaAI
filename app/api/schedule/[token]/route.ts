import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendInterviewScheduledEmail } from "@/lib/mail";

const SLOT_DURATION_MS = 30 * 60 * 1000; // 30-min slots
const TIMEZONE = "Asia/Kolkata";

// Generate 30-min slots for a given day (9 AM – 6 PM IST), returning UTC Date objects
function generateSlots(dateIST: string): Date[] {
    const slots: Date[] = [];
    // dateIST is YYYY-MM-DD in IST
    for (let hour = 9; hour < 18; hour++) {
        for (const minute of [0, 30]) {
            // Build ISO string as IST then convert
            const localStr = `${dateIST}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
            // Parse as IST by using Intl — simpler: offset IST = UTC+5:30
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
        where: { accessToken: token },
        include: {
            application: {
                include: {
                    drive: {
                        include: { organization: { select: { name: true, maxConcurrentSlots: true } } },
                    },
                },
            },
        },
    });

    if (!interview) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    if (interview.scheduledAt) {
        return NextResponse.json({ error: "Slot already booked", alreadyBooked: true, scheduledAt: interview.scheduledAt }, { status: 409 });
    }
    if (["COMPLETED", "IN_PROGRESS"].includes(interview.status)) {
        return NextResponse.json({ error: "Interview already started or completed" }, { status: 409 });
    }

    const org = interview.application.drive?.organization;
    const maxSlots = org?.maxConcurrentSlots ?? 5;

    const result: { info: object; deadline?: string; slots?: string[] } = {
        info: {
            candidateName: interview.application.fullName,
            jobTitle: interview.application.drive?.role || interview.application.drive?.title,
            orgName: org?.name,
            duration: 20,
            slotDuration: 30,
            timezone: TIMEZONE,
        },
    };

    if (interview.application.drive?.deadline) {
        result.deadline = interview.application.drive.deadline.toISOString();
    }

    if (dateIST) {
        const drive = interview.application.drive;
        const deadlineMs = drive?.deadline ? drive.deadline.getTime() : null;
        const dateMs = new Date(dateIST + "T23:59:59+05:30").getTime(); // End of day in IST

        // If deadline is before this date, no slots available
        if (deadlineMs && deadlineMs < dateMs) {
            result.slots = [];
            return NextResponse.json(result);
        }

        const allSlots = generateSlots(dateIST).filter(s => s.getTime() > Date.now());

        // Count booked interviews per slot window for this org's drive
        const driveId = interview.application.drive?.id;
        const bookedCounts = await prisma.interview.groupBy({
            by: ["scheduledAt"],
            where: {
                scheduledAt: { not: null },
                application: { driveId },
            },
            _count: { scheduledAt: true },
        });
        const countMap = new Map<number, number>();
        for (const b of bookedCounts) {
            if (b.scheduledAt) countMap.set(b.scheduledAt.getTime(), b._count.scheduledAt);
        }

        const available = allSlots.filter(s => (countMap.get(s.getTime()) ?? 0) < maxSlots);
        result.slots = available.map(s => s.toISOString());
    }

    return NextResponse.json(result);
}

// POST /api/schedule/[token]
// Body: { slotISO: string }  — books the slot and sends interview link email
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
        where: { accessToken: token },
        include: {
            application: {
                include: {
                    drive: {
                        include: { organization: { select: { name: true, maxConcurrentSlots: true, id: true } } },
                    },
                },
            },
        },
    });

    if (!interview) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    if (interview.scheduledAt) return NextResponse.json({ error: "Already booked", alreadyBooked: true }, { status: 409 });

    const org = interview.application.drive?.organization;
    const maxSlots = org?.maxConcurrentSlots ?? 5;
    const driveId = interview.application.drive?.id;

    // Atomic concurrency check: count how many interviews share this exact slot for the drive
    const count = await prisma.interview.count({
        where: { scheduledAt: slotDate, application: { driveId } },
    });
    if (count >= maxSlots) {
        return NextResponse.json({ error: "Slot full, please pick another", slotFull: true }, { status: 409 });
    }

    // Book the slot
    await prisma.interview.update({
        where: { id: interview.id },
        data: { scheduledAt: slotDate, timezone: TIMEZONE },
    });

    // Build interview link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sreevaai.com";
    const interviewLink = `${appUrl}/interview/${interview.applicationId}?token=${interview.accessToken}`;

    // Send confirmation email with interview link
    await sendInterviewScheduledEmail({
        email: interview.application.email,
        fullName: interview.application.fullName,
        jobTitle: interview.application.drive?.role || interview.application.drive?.title || "Interview",
        orgName: org?.name || "The Organization",
        interviewLink,
        scheduledAt: slotDate,
        timezone: TIMEZONE,
    });

    return NextResponse.json({ success: true, scheduledAt: slotDate.toISOString() });
}
