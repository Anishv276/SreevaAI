import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { generateId } from "@/lib/ids";
import { normalizeProctoringEvents, type ProctoringEvent } from "@/lib/proctoring";
import { z } from "zod";
import { isInterviewTokenRequired } from "@/lib/interview-access";

export const runtime = "nodejs";

const proctoringSignalSchema = z.object({
  applicationId: z.string().min(1, "Application ID required"),
  interviewToken: z.string().min(1, "Security token required"),
  events: z.array(z.object({
    eventType: z.string().min(1),
    severity: z.enum(["low", "medium", "high"]).optional(),
    reason: z.string().optional(),
    durationSeconds: z.number().int().nonnegative().optional(),
    strike: z.number().int().positive().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.number().int().nonnegative().optional(),
  })).min(1, "At least one event is required"),
});

function parseStoredEvents(raw: unknown): ProctoringEvent[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ProctoringEvent[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = proctoringSignalSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { applicationId, interviewToken } = result.data;
    const requireInterviewToken = isInterviewTokenRequired();

    // ── AUTHENTICATION ────────────────────────────────
    const authCheck = await prisma.interview.findUnique({
      where: { applicationId },
      select: { accessToken: true }
    });
    if (requireInterviewToken && (!authCheck || authCheck.accessToken !== interviewToken)) {
      return NextResponse.json({ error: "Unauthorized: Invalid security token" }, { status: 401 });
    }

    const events = normalizeProctoringEvents(result.data.events);

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { fullName: true },
    });

    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      select: { id: true, proctoringEvents: true },
    });

    const currentEvents = parseStoredEvents(interview?.proctoringEvents);
    const mergedEvents = [...currentEvents, ...events].slice(-400);
    const now = new Date();

    if (interview) {
      await prisma.$executeRawUnsafe(
        `
        UPDATE "Interview"
        SET "proctoringEvents" = $1::jsonb,
            "updatedAt" = $2
        WHERE "applicationId" = $3
        `,
        JSON.stringify(mergedEvents),
        now,
        applicationId
      );
    } else {
      await prisma.interview.upsert({
        where: { applicationId },
        update: {
          proctoringEvents: mergedEvents as any,
          updatedAt: now,
        },
        create: {
          id: generateId("int", app?.fullName || applicationId),
          applicationId,
          accessToken: crypto.randomUUID(),
          status: "IN_PROGRESS",
          proctoringEvents: mergedEvents as any,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    return NextResponse.json({
      success: true,
      saved: events.length,
      total: mergedEvents.length,
    });
  } catch (error) {
    console.error("[PROCTORING_QUEUE_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to save proctoring events" },
      { status: 500 }
    );
  }
}
