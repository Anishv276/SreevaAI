/**
 * scripts/refresh-org-usage-summary.ts
 * ====================================
 * Recomputes the OrgUsageSummary table (one row per org, one cost column per
 * billing feature) from OrganizationDetails.platformUsageMetrics + the
 * UsageEvent ledger, via lib/usage-metrics.ts#refreshAllOrgUsageSummaries.
 *
 * Safe to re-run any time -- it's a pure recompute + upsert, never additive.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/refresh-org-usage-summary.ts [--org <orgId>]
 */
import "dotenv/config";
import { refreshAllOrgUsageSummaries, refreshOrgUsageSummary } from "../lib/usage-metrics";
import { prisma } from "../lib/prisma";

async function main() {
  const args = process.argv.slice(2);
  const orgIdx = args.indexOf("--org");
  const orgId = orgIdx >= 0 ? args[orgIdx + 1] : null;

  if (orgId) {
    const result = await refreshOrgUsageSummary(orgId);
    if (!result) {
      console.error(`[refresh-org-usage-summary] org not found: ${orgId}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[refresh-org-usage-summary] refreshed org=${orgId} totalCostUsd=${result.totalCostUsd}`);
    return;
  }

  const count = await refreshAllOrgUsageSummaries();
  console.log(`[refresh-org-usage-summary] refreshed ${count} orgs`);
}

main()
  .catch((e) => {
    console.error("[refresh-org-usage-summary] failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
