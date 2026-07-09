import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { interviewStartQueue } from "@/lib/queue";
export const runtime = "nodejs";
type StartInterviewBody = {
  token?: string;
  startedAtMs?: number;
};
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;
    const body = (await request.json().catch(() => ({}))) as StartInterviewBody;
    const interviewToken = String(body.token || "").trim();
    const startedAtMs = Number(body.startedAtMs);
    const requireInterviewToken = isInterviewTokenRequired();
    if (!applicationId) {
      return NextResponse.json({ error: "Application ID required" }, { status: 400 });
    }
    if (Number.isNaN(startedAtMs) || !Number.isFinite(startedAtMs)) {
      return NextResponse.json({ error: "startedAtMs is required" }, { status: 400 });
    }
    if (requireInterviewToken && !interviewToken) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const interview = await prisma.interview.findUnique({
      where: { applicationId },
      select: {
        accessToken: true,
        expiresAt: true,
        interviewStartedAt: true,
        status: true,
      },
    });
    if (!interview) {
      return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
    }
    if (requireInterviewToken && interview.accessToken !== interviewToken) {
      return NextResponse.json({ error: "Invalid interview token" }, { status: 401 });
    }
    const interviewRecordStatus = String(interview.status || "").toUpperCase();
    if (interviewRecordStatus === "COMPLETED" || interviewRecordStatus === "FAILED") {
      return NextResponse.json({
        error: "Interview has been completed.",
        code: "INTERVIEW_COMPLETED",
      }, { status: 409 });
    }
    // interviewStartedAt is the real "greeting spoken" timestamp -- idempotent, one-way latch.
    if (interview.interviewStartedAt) {
      return NextResponse.json({
        success: true,
        alreadyStarted: true,
        startedAt: interview.interviewStartedAt,
      });
    }
    await interviewStartQueue.add(
      "mark-interview-started",
      {
        applicationId,
        startedAt: new Date(startedAtMs).toISOString(),
        accessToken: interview.accessToken,
      },
    );
    return NextResponse.json({
      success: true,
      queued: true,
      startedAt: new Date(startedAtMs).toISOString(),
    });
  } catch (error) {
    console.error("[INTERVIEW START ERROR]:", error);
    return NextResponse.json({ error: "Failed to record interview start" }, { status: 500 });
  }
}
