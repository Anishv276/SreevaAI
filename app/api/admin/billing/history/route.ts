import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { getRecordingDurationSec } from "@/lib/recording-state";
function normalizeStatus(value?: string | null) {
  const v = String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (v === "completed" || v === "finished") return "completed";
  if (v === "no-show" || v === "noshow") return "no-show";
  if (v === "abandoned") return "abandoned";
  if (v === "in-progress" || v === "inprogress") return "in-progress";
  if (v === "pending") return "pending";
  return "completed";
}
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || (!isAdminRole(session.role) && !isSuperAdminRole(session.role))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const requestedOrgId = searchParams.get("orgId")?.trim() || null;
    const orgId = isSuperAdminRole(session.role) ? (requestedOrgId || session.orgId) : session.orgId;
    if (!orgId) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 });
    }
    const interviews = await prisma.interview.findMany({
      where: {
        interviewStatus: { not: "PENDING" },
        application: { job: { organizationId: orgId } },
      },
      select: {
        id: true,
        interviewStatus: true,
        interviewUpdatedAt: true,
        interviewCompletedAt: true,
        durationInSeconds: true,
        sessionRecording: true,
        application: {
          select: {
            candidateFullName: true,
            job: { select: { title: true, jobRole: true } },
          },
        },
      },
      orderBy: { interviewUpdatedAt: "desc" },
      take: 50,
    });
    const rows = interviews
      .map((row) => {
        // Single source of truth: Interview.durationInSeconds (set exactly once,
        // clamped to the fixed session length for time-limit endings, by
        // update_interview_status() in agent_persistence.py). Falls back to the
        // recording file length only for older rows saved before that column
        // existed. Credits are derived from that SAME durationSec, using the
        // identical formula billing.py's deduct_quota() uses — so this table's
        // duration and credits columns can never disagree with each other or
        // with what was actually billed.
        const durationSec = Number(row.durationInSeconds ?? getRecordingDurationSec(row.sessionRecording) ?? 0);
        const creditsUsed = durationSec > 0 ? Math.round((durationSec / 60) * 100) / 100 : 0;
        const date = (row.interviewCompletedAt ?? row.interviewUpdatedAt).toISOString();
        return {
          id: row.id,
          candidate: row.application?.candidateFullName || "Unknown Candidate",
          role: row.application?.job?.jobRole || row.application?.job?.title || "Unknown Role",
          interviews: 1,
          creditsUsed,
          status: normalizeStatus(row.interviewStatus),
          date,
          time: (() => { const m = Math.floor(durationSec / 60); const s = durationSec % 60; return durationSec ? `${m}m ${String(s).padStart(2, "0")}s` : undefined; })(),
        };
      })
      .filter((row) => row.status !== "pending");
    return NextResponse.json({ rows }, {
      headers: { 'Cache-Control': 'private, max-age=120' }
    });
  } catch (error) {
    console.error("[BILLING_HISTORY] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch billing history" }, { status: 500 });
  }
}
