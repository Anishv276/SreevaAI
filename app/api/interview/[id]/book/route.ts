import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateId } from "@/lib/ids";
import { v4 as uuidv4 } from "uuid";
import { sendApplicationStatusEmail } from "@/lib/mail";
import { isInterviewTokenRequired } from "@/lib/interview-access";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    console.error("[BOOKING API] POST request received");
    try {
        const prismaAny = prisma as any;
        const { id } = await params;
        const body = await request.json();
        const startTime = new Date(body.startTime);
        const providedName = String(body.name || "").trim();
        const candidateTimeZone = String(body.timeZone || "").trim();

        if (isNaN(startTime.getTime())) {
            return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
        }
        if (!providedName) {
            return NextResponse.json({ error: "Name is required to book a slot" }, { status: 400 });
        }

        const app = await prismaAny.application.findUnique({
            where: { id },
            include: { drive: true, interview: true }
        });

        if (!app) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 });
        }

        if (app.interview?.slotId) {
            return NextResponse.json({ error: "Slot already booked" }, { status: 400 });
        }

        const endTime = new Date(startTime.getTime() + 20 * 60000);
        const orgId = app.drive?.orgId;
        const driveId = app.drive?.id;

        if (!orgId || !driveId) {
            return NextResponse.json({ error: "Incomplete application data" }, { status: 400 });
        }

        const bookingResult = await prismaAny.$transaction(async (tx: any) => {
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

            const interviewToken = app.interview?.accessToken || uuidv4();
            const expiresAt = new Date(startTime.getTime() + 48 * 60 * 60 * 1000);
            const interviewId = app.interview?.id || generateId("int", app.fullName || app.id);

            if (app.interview) {
                await tx.interview.update({
                    where: { id: app.interview.id },
                    data: {
                        accessToken: interviewToken,
                        expiresAt,
                        slotId: slot.id,
                        scheduledAt: startTime,
                        status: "PENDING",
                        startedAt: null,
                        completedAt: null,
                    }
                });
            } else {
                await tx.interview.create({
                    data: {
                        id: interviewId,
                        applicationId: app.id,
                        accessToken: interviewToken,
                        expiresAt,
                        status: "PENDING",
                        slotId: slot.id,
                        scheduledAt: startTime,
                    }
                });
            }

            await tx.application.update({
                where: { id: app.id },
                data: {
                    interviewStatus: "booked"
                }
            });

            return {
                slot,
                interviewToken,
            };
        });

        // Send confirmation directly from API to avoid queue action/template mismatch.
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const interviewBase = `${baseUrl}/interview/${app.id}`;
        const interviewLink = isInterviewTokenRequired() && bookingResult.interviewToken
            ? `${interviewBase}?token=${bookingResult.interviewToken}`
            : interviewBase;
        const mailResult = await sendApplicationStatusEmail({
            email: app.email,
            fullName: app.fullName,
            jobTitle: app.drive?.title || "Unknown Role",
            status: "CONFIRMED",
            interviewLink,
            scheduledAt: startTime,
            scheduledTimeZone: candidateTimeZone || undefined,
        });
        if (!mailResult.success) {
            console.error("[BOOKING API] Confirmation email failed:", mailResult.error);
        }

        return NextResponse.json({ success: true, slot: bookingResult.slot });
    } catch (err: any) {
        if (err.message === "SLOT_FULL") {
            return NextResponse.json({ error: "This slot is full. Please choose another." }, { status: 409 });
        }
        console.error("[BOOKING API] Error:", err);
        return NextResponse.json({ error: "Failed to book slot" }, { status: 500 });
    }
}
