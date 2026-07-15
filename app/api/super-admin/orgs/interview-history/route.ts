import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdminRole } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
const round = (v: number) => Math.round(v * 1e6) / 1e6;
const arr = (v: any) => (Array.isArray(v) ? v : []);
const sumLlm = (bucket: any) => arr(bucket?.llm).reduce((s: number, m: any) => s + n(m.costUsd), 0);

/**
 * GET /api/super-admin/orgs/interview-history?orgId=
 * Per-interview cost from the UsageEvent ledger (interview:{applicationId} row,
 * isTest=false). llmCostUsd = eval+brief+llmGeneration+report LLM; ttsCostUsd /
 * sttCostUsd from usage.tts/stt. Response shape unchanged from the blob version.
 */
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
        applicationId: string;
        interviewStatus: string;
        durationInSeconds: number | null;
        recordingDurationSec: number | null;
        interviewCompletedAt: Date | null;
        interviewUpdatedAt: Date;
        candidateFullName: string | null;
        jobRole: string | null;
        jobTitle: string | null;
      }>
    >`
      SELECT
        i.id,
        i."applicationId",
        i."interviewStatus",
        i."durationInSeconds",
        NULLIF(i."sessionRecording"->>'durationSec', '')::integer AS "recordingDurationSec",
        i."interviewCompletedAt",
        i."interviewUpdatedAt",
        a."candidateFullName",
        d."jobRole",
        d.title AS "jobTitle"
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

    // One UsageEvent lookup for all these interviews (keyed by applicationId).
    const appIds = rows.map((r) => r.applicationId);
    const usageRows = appIds.length
      ? await prisma.usageEvent.findMany({
          where: { feature: "interview", isTest: false, applicationId: { in: appIds } },
          select: { applicationId: true, usage: true },
        })
      : [];
    const usageByApp = new Map<string, unknown>();
    for (const u of usageRows) if (u.applicationId) usageByApp.set(u.applicationId, u.usage);

    const result = rows
      .map((row) => {
        const usage = (usageByApp.get(row.applicationId) as Record<string, any>) || null;
        const hasBillingSnapshot = usage !== null;
        const llmCostUsd = hasBillingSnapshot
          ? round(sumLlm(usage.eval) + sumLlm(usage.brief) + sumLlm(usage.llmGeneration) + sumLlm(usage.report))
          : null;
        const ttsCostUsd = hasBillingSnapshot ? round(n(usage.tts?.costUsd)) : null;
        const sttCostUsd = hasBillingSnapshot ? round(n(usage.stt?.costUsd)) : null;
        const totalCostUsd = hasBillingSnapshot
          ? round(n(llmCostUsd) + n(ttsCostUsd) + n(sttCostUsd))
          : null;
        const durationSec = Number(row.durationInSeconds ?? row.recordingDurationSec ?? 0);
        const date = (row.interviewCompletedAt ?? row.interviewUpdatedAt).toISOString();
        return {
          id: row.id,
          interviewName: `${row.candidateFullName || "Unknown Candidate"} - ${row.jobTitle || row.jobRole || "Interview"}`,
          candidate: String(row.candidateFullName || "Unknown Candidate"),
          role: String(row.jobRole || row.jobTitle || "Unknown Role"),
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
