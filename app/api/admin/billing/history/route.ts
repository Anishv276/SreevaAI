import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";

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
        status: { not: "PENDING" },
        application: { drive: { orgId } },
      },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        completedAt: true,
        interviewDuration: true,
        recordingDurationSec: true,
        application: {
          select: {
            fullName: true,
            drive: { select: { title: true, role: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    const rows = interviews
      .map((row) => {
        const durationSec = Number(row.interviewDuration ?? row.recordingDurationSec ?? 0);
        const date = (row.completedAt ?? row.updatedAt).toISOString();
        return {
          id: row.id,
          candidate: row.application?.fullName || "Unknown Candidate",
          role: row.application?.drive?.role || row.application?.drive?.title || "Unknown Role",
          interviews: 1,
          creditsUsed: Math.round((durationSec / 60) * 100) / 100,
          status: normalizeStatus(row.status),
          date,
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
