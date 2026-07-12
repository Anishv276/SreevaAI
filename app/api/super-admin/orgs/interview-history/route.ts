import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdminRole } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";
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
        interviewStatus: string;
        durationInSeconds: number | null;
        recordingDurationSec: number | null;
        interviewCompletedAt: Date | null;
        interviewUpdatedAt: Date;
        candidateFullName: string | null;
        jobRole: string | null;
        jobTitle: string | null;
        billingSnapshotAtCompletion: unknown;
      }>
    >`
      SELECT
        i.id,
        i."interviewStatus",
        i."durationInSeconds",
        NULLIF(i."sessionRecording"->>'durationSec', '')::integer AS "recordingDurationSec",
        i."interviewCompletedAt",
        i."interviewUpdatedAt",
        a."candidateFullName",
        d."jobRole",
        d.title AS "jobTitle",
        COALESCE(i."billingSnapshotAtCompletion", '{}'::jsonb) AS "billingSnapshotAtCompletion"
      FROM "Interview" i
      JOIN "Application" a ON a.id = i."applicationId"
      JOIN "Job" d ON d.id = a."jobId"
      WHERE d."organizationId" = ${orgId}
        AND i."isDeleted" = false
        AND a."isDeleted" = false
        AND d."isDeleted" = false
      ORDER BY COALESCE(i."interviewCompletedAt", i."interviewUpdatedAt") DESC
      LIMIT 100
    `;
    const result = rows
      .map((row) => {
        const snapshot = (row.billingSnapshotAtCompletion && typeof row.billingSnapshotAtCompletion === "object" ? row.billingSnapshotAtCompletion : {}) as Record<string, unknown>;
        // Interview.durationInSeconds is the single source of truth for duration
        // (see app/api/admin/billing/history/route.ts) — only fall back to the
        // recording file length for rows saved before that column existed.
        const durationSec = Number(row.durationInSeconds ?? row.recordingDurationSec ?? 0);
        const date = (row.interviewCompletedAt ?? row.interviewUpdatedAt).toISOString();
        const hasExactBreakdown =
          String(snapshot.costSource || "").toLowerCase() === "exact" ||
          snapshot.llmCostUsd !== undefined ||
          snapshot.ttsCostUsd !== undefined ||
          snapshot.sttCostUsd !== undefined;
        const hasBillingSnapshot = hasExactBreakdown;
        const llmCostUsd = hasBillingSnapshot ? Number(snapshot.llmCostUsd ?? 0) : null;
        const ttsCostUsd = hasBillingSnapshot ? Number(snapshot.ttsCostUsd ?? 0) : null;
        const sttCostUsd = hasBillingSnapshot ? Number(snapshot.sttCostUsd ?? 0) : null;
        const totalCostUsd = hasBillingSnapshot
          ? Number(snapshot.totalCostUsd ?? (Number(llmCostUsd || 0) + Number(ttsCostUsd || 0) + Number(sttCostUsd || 0)))
          : null;
        return {
          id: row.id,
          interviewName: String(snapshot.interviewName || `${row.candidateFullName || "Unknown Candidate"} - ${row.jobTitle || row.jobRole || "Interview"}`),
          candidate: String(snapshot.candidateName || row.candidateFullName || "Unknown Candidate"),
          role: String(snapshot.jobTitle || row.jobRole || row.jobTitle || "Unknown Role"),
          durationSec,
          llmCostUsd,
          ttsCostUsd,
          sttCostUsd,
          totalCostUsd,
          status: row.interviewStatus,
          date,
          hasBillingSnapshot,
        };
      })
      .filter((row) => row.status.toUpperCase() !== "PENDING");
    return NextResponse.json({ rows: result });
  } catch (error) {
    return apiErrorResponse({
      route: "/api/super-admin/orgs/interview-history",
      method: "GET",
      error,
      body: { error: "Failed to fetch interview history" },
      status: 500,
      logLabel: "[SUPER_ADMIN_INTERVIEW_HISTORY] GET error:",
    });
  }
}
