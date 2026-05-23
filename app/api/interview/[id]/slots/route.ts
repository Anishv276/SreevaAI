import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FIXED_INTERVIEW_DURATION_MINUTES, INTERVIEW_SLOT_INTERVAL_MINUTES } from "@/lib/drive-limits";
import { roundToCurrentSlotBoundary, roundToNextSlotBoundary } from "@/lib/interview-slot-policy";
import { isInterviewTestMode } from "@/lib/interview-access";
import { isSlotMode, resolveInterviewMode } from "@/lib/interview-mode";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const prismaAny = prisma as any;
        const { id } = await params;
        const app = await prismaAny.application.findUnique({
            where: { id },
            include: { drive: { include: { organization: true } }, interview: true }
        });
        if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

        if (!app?.drive?.orgId) {
            console.error("[SLOTS API] Missing orgId for app:", id);
            return NextResponse.json({ error: "Organization not found for this drive" }, { status: 400 });
        }
        const orgId = app.drive.orgId;
        console.log("[SLOTS API] Generating slots for org:", orgId);

        const roleLabel = app.drive.role || app.drive.title;
        const companyName = app.drive.organization?.name || "Company";
        const bookedSlot = app.interview?.scheduledAt ? app.interview.scheduledAt.getTime() : null;
        const effectiveInterviewMode = resolveInterviewMode(
            null,
            app.drive?.organization?.interviewMode
        );
        const slotSchedulingEnabled = isSlotMode(effectiveInterviewMode);

        if (!slotSchedulingEnabled) {
            return NextResponse.json({
                slotSchedulingEnabled: false,
                slots: [],
                bookedSlot,
                role: roleLabel,
                company: companyName,
                deadline: app.drive?.deadline || null,
            });
        }

        const now = new Date();
        const driveDeadline = app.drive?.deadline ? new Date(app.drive.deadline) : null;
        const fallbackEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const end = driveDeadline && !Number.isNaN(driveDeadline.getTime()) ? driveDeadline : fallbackEnd;

        // Get existing slots for the entire org to enforce org-level concurrency
        const existingSlots = await prismaAny.interviewSlot.findMany({
            where: {
                orgId,
                startTime: { gte: now, lte: end }
            }
        });

        const slotMap = new Map();
        for (const slot of existingSlots) {
            slotMap.set(slot.startTime.getTime(), slot);
        }

        const availableSlots = [];

        const currentTime = isInterviewTestMode()
            ? roundToCurrentSlotBoundary(new Date(), INTERVIEW_SLOT_INTERVAL_MINUTES)
            : roundToNextSlotBoundary(new Date(), INTERVIEW_SLOT_INTERVAL_MINUTES);

        while (currentTime < end) {
            const timeMs = currentTime.getTime();
            const existing = slotMap.get(timeMs);

            if (!existing || existing.bookedCount < existing.maxCapacity) {
                availableSlots.push({
                    slotId: existing?.id || `slot_${orgId}_${timeMs}`,
                    startTime: new Date(timeMs),
                    endTime: new Date(timeMs + FIXED_INTERVIEW_DURATION_MINUTES * 60000),
                    available: existing ? existing.maxCapacity - existing.bookedCount : 5
                });
            }
            currentTime.setMinutes(currentTime.getMinutes() + INTERVIEW_SLOT_INTERVAL_MINUTES);
        }

        console.log(`[SLOTS API] Found ${availableSlots.length} available slots`);
        return NextResponse.json({
            slotSchedulingEnabled: true,
            slots: availableSlots,
            bookedSlot,
            role: roleLabel,
            company: companyName
        });
    } catch (err) {
        console.error("Failed to load slots", err);
        return NextResponse.json({ error: "Failed to load slots" }, { status: 500 });
    }
}
