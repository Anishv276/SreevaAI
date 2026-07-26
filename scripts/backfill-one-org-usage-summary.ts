/**
 * One-off: backfill OrgUsageSummary for a single org from existing UsageEvent
 * rows, for orgs whose summary predates the _refresh_org_usage_summary hook
 * added to billing.py (which only refreshes on the next write).
 *
 * Usage: npx tsx --env-file=.env scripts/backfill-one-org-usage-summary.ts <orgId>
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { computeOrgUsageBreakdown } from "../lib/usage-metrics";

async function main() {
  const orgId = process.argv[2];
  if (!orgId) {
    console.error("Usage: tsx scripts/backfill-one-org-usage-summary.ts <orgId>");
    process.exit(1);
  }
  const org = await prisma.organizationDetails.findUnique({ where: { id: orgId }, select: { id: true, name: true } });
  if (!org) {
    console.error(`Org not found: ${orgId}`);
    process.exit(1);
  }
  const b = await computeOrgUsageBreakdown(org);
  await prisma.orgUsageSummary.upsert({
    where: { orgId: b.orgId },
    create: {
      orgId: b.orgId, orgName: b.orgName,
      jdExtractionCostUsd: b.jdExtractionCostUsd,
      resumeExtractionCostUsd: b.resumeExtractionCostUsd,
      resumeReportCostUsd: b.resumeReportCostUsd,
      interviewLlmCostUsd: b.interviewLlmCostUsd,
      interviewEvalCostUsd: b.interviewEvalCostUsd,
      questionBankCostUsd: b.questionBankCostUsd,
      interviewGenerationCostUsd: b.interviewGenerationCostUsd,
      interviewTtsCostUsd: b.interviewTtsCostUsd,
      interviewSttCostUsd: b.interviewSttCostUsd,
      interviewReportCostUsd: b.interviewReportCostUsd,
      totalCostUsd: b.totalCostUsd,
    },
    update: {
      orgName: b.orgName,
      jdExtractionCostUsd: b.jdExtractionCostUsd,
      resumeExtractionCostUsd: b.resumeExtractionCostUsd,
      resumeReportCostUsd: b.resumeReportCostUsd,
      interviewLlmCostUsd: b.interviewLlmCostUsd,
      interviewEvalCostUsd: b.interviewEvalCostUsd,
      questionBankCostUsd: b.questionBankCostUsd,
      interviewGenerationCostUsd: b.interviewGenerationCostUsd,
      interviewTtsCostUsd: b.interviewTtsCostUsd,
      interviewSttCostUsd: b.interviewSttCostUsd,
      interviewReportCostUsd: b.interviewReportCostUsd,
      totalCostUsd: b.totalCostUsd,
      lastComputedAt: new Date(),
    },
  });
  console.log(JSON.stringify(b, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
