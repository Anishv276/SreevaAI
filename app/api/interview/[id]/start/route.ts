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
        startedAt: true,
        status: true,
        linkStatus: true,
      },
    });
    if (!interview) {
      return NextResponse.json({ error: "Interview session not found" }, { status: 404 });
    }
    if (requireInterviewToken && interview.accessToken !== interviewToken) {
      return NextResponse.json({ error: "Invalid interview token" }, { status: 401 });
    }
    const startNow = Date.now();
    const interviewRecordStatus = String(interview.status || "").toUpperCase();
    if (interviewRecordStatus === "COMPLETED" || interviewRecordStatus === "NO_SHOW") {
      return NextResponse.json({
        error: "Interview has been completed.",
        code: "INTERVIEW_COMPLETED",
      }, { status: 409 });
    }
    if (interview.startedAt) {
      if (interview.linkStatus === "EXPIRED") {
        return NextResponse.json({
          error: "Access Denied: Interview link has expired. Please contact support.",
          code: "LINK_EXPIRED",
        }, { status: 403 });
      }
      return NextResponse.json({
        success: true,
        alreadyStarted: true,
        startedAt: interview.startedAt,
      });
    }
    if (interview.linkStatus === "EXPIRED") {
      return NextResponse.json({
        error: "Access Denied: Interview link has expired. Please contact support.",
        code: "LINK_EXPIRED",
      }, { status: 403 });
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
