-- CreateTable: materialized per-org cost summary, refreshed from
-- OrganizationDetails.platformUsageMetrics + UsageEvent via
-- lib/usage-metrics.ts#refreshOrgUsageSummary. Not written to directly by
-- request handlers.
CREATE TABLE "OrgUsageSummary" (
    "orgId" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "jdExtractionCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "resumeExtractionCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "resumeReportCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interviewLlmCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interviewEvalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interviewBriefCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interviewGenerationCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interviewTtsCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interviewSttCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interviewReportCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgUsageSummary_pkey" PRIMARY KEY ("orgId")
);
