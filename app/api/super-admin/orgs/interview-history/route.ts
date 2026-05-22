import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdminRole } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || !isSuperAdminRole(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("orgId")?.trim();
    if (!orgId) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 });
    }

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        status: string;
        interviewDuration: number | null;
        recordingDurationSec: number | null;
        completedAt: Date | null;
        updatedAt: Date;
        fullName: string | null;
        driveRole: string | null;
        driveTitle: string | null;
        billingSnapshot: unknown;
      }>
    >`
      SELECT
        i.id,
        i.status,
        i."interviewDuration",
        i."recordingDurationSec",
        i."completedAt",
        i."updatedAt",
        a."fullName",
        d.role AS "driveRole",
        d.title AS "driveTitle",
        COALESCE(i."billingSnapshot", '{}'::jsonb) AS "billingSnapshot"
      FROM "Interview" i
      JOIN "Application" a ON a.id = i."applicationId"
      JOIN "Drive" d ON d.id = a."driveId"
      WHERE d."orgId" = ${orgId}
      ORDER BY COALESCE(i."completedAt", i."updatedAt") DESC
      LIMIT 100
    `;

    const result = rows
      .map((row) => {
        const snapshot = (row.billingSnapshot && typeof row.billingSnapshot === "object" ? row.billingSnapshot : {}) as Record<string, unknown>;
        const durationSec = Number(snapshot.durationSec ?? row.interviewDuration ?? row.recordingDurationSec ?? 0);
        const date = (row.completedAt ?? row.updatedAt).toISOString();
        const llmCostUsd = Number(snapshot.llmCostUsd ?? 0);
        const ttsCostUsd = Number(snapshot.ttsCostUsd ?? 0);
        const sttCostUsd = Number(snapshot.sttCostUsd ?? 0);
        const totalCostUsd = Number(snapshot.totalCostUsd ?? (llmCostUsd + ttsCostUsd + sttCostUsd));
        const hasExactBreakdown =
          String(snapshot.costSource || "").toLowerCase() === "exact" ||
          snapshot.llmCostUsd !== undefined ||
          snapshot.ttsCostUsd !== undefined ||
          snapshot.sttCostUsd !== undefined;
        const hasBillingSnapshot = hasExactBreakdown;

        return {
          id: row.id,
          interviewName: String(snapshot.interviewName || `${row.fullName || "Unknown Candidate"} - ${row.driveTitle || row.driveRole || "Interview"}`),
          candidate: String(snapshot.candidateName || row.fullName || "Unknown Candidate"),
          role: String(snapshot.jobTitle || row.driveRole || row.driveTitle || "Unknown Role"),
          durationSec,
          llmCostUsd,
          ttsCostUsd,
          sttCostUsd,
          totalCostUsd,
          status: row.status,
          date,
          hasBillingSnapshot,
        };
      })
      .filter((row) => row.status.toUpperCase() !== "PENDING");

    return NextResponse.json({ rows: result });
  } catch (error) {
    console.error("[SUPER_ADMIN_INTERVIEW_HISTORY] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch interview history" }, { status: 500 });
  }
}
