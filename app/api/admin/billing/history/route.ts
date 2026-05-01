import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { getInterviewQuotaUnits } from "@/lib/credits";

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
        application: {
          drive: {
            orgId,
          },
        },
      },
      include: {
        application: {
          select: {
            fullName: true,
            drive: {
              select: {
                title: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 100,
    });

    const rows = interviews
      .map((row) => {
        const durationSec = Number(row.interviewDuration ?? row.recordingDurationSec ?? 0);
        const date = (row.completedAt ?? row.updatedAt).toISOString();
        return {
          id: row.id,
          candidate: row.application?.fullName || "Unknown Candidate",
          role: row.application?.drive?.role || row.application?.drive?.title || "Unknown Role",
          interviews: getInterviewQuotaUnits(durationSec),
          creditsUsed: Math.round((durationSec / 60) * 100) / 100,
          status: normalizeStatus(row.status),
          date,
        };
      })
      .filter((row) => row.status !== "pending");

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("[BILLING_HISTORY] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch billing history" }, { status: 500 });
  }
}
