import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invitationDeliveryQueue } from "@/lib/queue";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    console.error("[BOOKING API] POST request received");
    try {
        const { id } = await params;
        const body = await request.json();
        const startTime = new Date(body.startTime);

        if (isNaN(startTime.getTime())) {
            return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
        }

        const app = await prisma.application.findUnique({
            where: { id },
            include: { drive: true, interview: true }
        });

        if (!app || !app.interview) {
            return NextResponse.json({ error: "Interview not found" }, { status: 404 });
        }

        if (app.interview.slotId) {
            return NextResponse.json({ error: "Slot already booked" }, { status: 400 });
        }

        const endTime = new Date(startTime.getTime() + 20 * 60000);
        const orgId = app.drive?.orgId;
        const driveId = app.drive?.id;

        if (!orgId || !driveId) {
            return NextResponse.json({ error: "Incomplete application data" }, { status: 400 });
        }

        const slot = await prisma.$transaction(async (tx) => {
            let slot = await tx.interviewSlot.findFirst({
                where: {
                    orgId,
                    startTime,
                }
            });

            if (slot) {
                if (slot.bookedCount >= slot.maxCapacity) {
                    throw new Error("SLOT_FULL");
                }
                slot = await tx.interviewSlot.update({
                    where: { id: slot.id },
                    data: { bookedCount: { increment: 1 } }
                });
            } else {
                slot = await tx.interviewSlot.create({
                    data: {
                        orgId,
                        driveId,
                        startTime,
                        endTime,
                        maxCapacity: 5,
                        bookedCount: 1,
                        status: "ACTIVE"
                    }
                });
            }

            await tx.interview.update({
                where: { id: app.interview.id },
                data: {
                    slotId: slot.id,
                    scheduledAt: startTime,
                }
            });

            await tx.application.update({
                where: { id: app.id },
                data: {
                    interviewStatus: "booked"
                }
            });

            return slot;
        });

        // Dispatch confirmation email
        console.error(`[BOOKING API] Dispatching confirmation for ${app.id}`);
        await invitationDeliveryQueue.add(
            "confirm-interview",
            {
                applicationId: app.id,
                action: "confirm",
                scheduledAt: startTime.toISOString()
            },
            { removeOnComplete: true, removeOnFail: false, attempts: 3, backoff: { type: "exponential", delay: 5000 } }
        );

        console.error("[BOOKING API] Job added to queue successfully");
        return NextResponse.json({ success: true, slot });
    } catch (err: any) {
        if (err.message === "SLOT_FULL") {
            return NextResponse.json({ error: "This slot is full. Please choose another." }, { status: 409 });
        }
        console.error("[BOOKING API] Error:", err);
        return NextResponse.json({ error: "Failed to book slot" }, { status: 500 });
    }
}
