import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { generateId } from "@/lib/ids";
import { getProctoringCategory, normalizeProctoringEvents, type ProctoringEvent } from "@/lib/proctoring";
import { DEFAULT_PROCTORING_SIGNALS, isProctoringSignalEnabled, normalizeProctoringSignals } from "@/lib/proctoring-signals";
import { z } from "zod";
import { isInterviewTokenRequired } from "@/lib/interview-access";
export const runtime = "nodejs";
const JOIN_WINDOW_MS = 5 * 60 * 1000;
const proctoringSignalSchema = z.object({
  applicationId: z.string().min(1, "Application ID required"),
  interviewToken: z.string().optional().default(""),
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
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const result = proctoringSignalSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { applicationId, interviewToken } = result.data;
    const requireInterviewToken = isInterviewTokenRequired();
    // -- AUTHENTICATION & LIFECYCLE --------------------
    const authCheck = await prisma.interview.findUnique({
      where: { applicationId },
      select: { candidateInviteToken: true, inviteLinkExpiresAt: true, interviewStartedAt: true, inviteLinkStatus: true, isTestSession: true }
    });
    if (requireInterviewToken && (!authCheck || authCheck.candidateInviteToken !== interviewToken)) {
      return NextResponse.json({ error: "Unauthorized: Invalid security token" }, { status: 401 });
    }
    if (authCheck) {
      const now = Date.now();
      const startedAtMs = authCheck.interviewStartedAt ? authCheck.interviewStartedAt.getTime() : null;
      // joinWindow only blocks active sessions -- not already-completed/no-show ones
      const joinWindowExpired = startedAtMs !== null && (now - startedAtMs) >= JOIN_WINDOW_MS;

      // Bypass expiration logic entirely if it's a test interview
      const isTest = authCheck.isTestSession === true;
      const isExpiredByTime = !isTest && joinWindowExpired;

      if (isExpiredByTime && authCheck.inviteLinkStatus !== "EXPIRED") {
        await prisma.interview.update({
          where: { applicationId },
          data: { inviteLinkStatus: "EXPIRED" },
        }).catch(() => { });
      }

      if (!isTest && (authCheck.inviteLinkStatus === "EXPIRED" || isExpiredByTime)) {
        return NextResponse.json({ error: "Access Denied: Interview link has expired. Please contact support." }, { status: 403 });
      }
    }
    const requestedEvents = normalizeProctoringEvents(result.data.events);
    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      select: { id: true, proctoringEvents: true },
    });
    const currentEvents = parseStoredEvents(interview?.proctoringEvents);
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        candidateFullName: true,
        job: {
          select: {
            organization: {
              select: { enabledProctoringSignals: true },
            },
          },
        },
      },
    });
    const orgToggles = normalizeProctoringSignals(
      app?.job?.organization?.enabledProctoringSignals || DEFAULT_PROCTORING_SIGNALS,
    );
    const events = requestedEvents.filter((event) => {
      const normalizedType = getProctoringCategory(event.eventType);
      return isProctoringSignalEnabled(orgToggles, normalizedType);
    });
    if (events.length === 0) {
      return NextResponse.json({
        success: true,
        saved: 0,
        total: currentEvents.length,
      });
    }
    const mergedEvents = [...currentEvents, ...events].slice(-400);
    const now = new Date();
    if (interview) {
      await prisma.interview.update({
        where: { applicationId },
        data: {
          proctoringEvents: mergedEvents,
          interviewUpdatedAt: now,
        }
      });
    } else {
      await prisma.interview.upsert({
        where: { applicationId },
        update: {
          proctoringEvents: mergedEvents,
          interviewUpdatedAt: now,
        },
        create: {
          id: generateId("int", app?.candidateFullName || applicationId),
          applicationId,
          candidateInviteToken: crypto.randomUUID(),
          interviewStatus: "IN_PROGRESS",
          proctoringEvents: mergedEvents,
          interviewCreatedAt: now,
          interviewUpdatedAt: now,
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
