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
    const prismaAny = prisma as any;
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
    const interview = await prismaAny.interview.findUnique({
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
    const startExpiresAtMs = interview.expiresAt ? interview.expiresAt.getTime() : null;
    const startIsExpiredByTime = startExpiresAtMs !== null && startNow > startExpiresAtMs;
    const interviewRecordStatus = String(interview.status || "").toUpperCase();
    if (interviewRecordStatus === "COMPLETED" || interviewRecordStatus === "NO_SHOW") {
      return NextResponse.json({
        error: "Interview has been completed.",
        code: "INTERVIEW_COMPLETED",
      }, { status: 409 });
    }
    if (interview.startedAt) {
      if (interview.linkStatus === "EXPIRED" || startIsExpiredByTime) {
        if (startIsExpiredByTime && interview.linkStatus !== "EXPIRED") {
          await prismaAny.interview.update({
            where: { applicationId },
            data: { linkStatus: "EXPIRED" },
          }).catch(() => {});
        }
        return NextResponse.json({
          error: startIsExpiredByTime
            ? "This job posting has closed. Applications are no longer being accepted."
            : "Access Denied: Interview link has expired. Please contact support.",
          code: startIsExpiredByTime ? "DRIVE_CLOSED" : "LINK_EXPIRED",
        }, { status: 403 });
      }
      return NextResponse.json({
        success: true,
        alreadyStarted: true,
        startedAt: interview.startedAt,
      });
    }
    const now = Date.now();
    const expiresAtMs = interview.expiresAt ? interview.expiresAt.getTime() : null;
    const isExpiredByTime = expiresAtMs !== null && now > expiresAtMs;
    // Reset EXPIRED status if the deadline hasn't passed — handles re-attempts after
    // a previous session completed or timed out with startedAt set.
    if (interview.linkStatus === "EXPIRED" && !isExpiredByTime) {
      await prismaAny.interview.update({
        where: { applicationId },
        data: { linkStatus: "ACTIVE", startedAt: null },
      }).catch(() => {});
      // Allow access — fall through
    } else {
      if (isExpiredByTime && interview.linkStatus !== "EXPIRED") {
        await prismaAny.interview.update({
          where: { applicationId },
          data: { linkStatus: "EXPIRED" },
        }).catch(() => {});
      }
      if (interview.linkStatus === "EXPIRED" || isExpiredByTime) {
        if (isExpiredByTime) {
          return NextResponse.json({
            error: "This job posting has closed. Applications are no longer being accepted.",
            code: "DRIVE_CLOSED",
          }, { status: 403 });
        }
        return NextResponse.json({
          error: "Access Denied: Interview link has expired. Please contact support.",
          code: "LINK_EXPIRED",
        }, { status: 403 });
      }
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
