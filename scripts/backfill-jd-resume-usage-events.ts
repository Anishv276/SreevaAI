/**
 * scripts/backfill-jd-resume-usage-events.ts
 * ===========================================
 * One-off backfill of per-item UsageEvent ledger rows for JD extraction,
 * resume extraction, and resume report costs that were recorded into the org
 * blob (OrganizationDetails.platformUsageMetrics.billing) BEFORE the
 * UsageEvent ledger existed. Companion to scripts/backfill-usage-events.ts
 * (which covers interview session/eval/brief/generation).
 *
 * Unlike interviews (one billingSnapshotAtCompletion per interview, so the
 * backfill is exact), the JD/resume blob buckets only store an AGGREGATE
 * byModel entry per org (e.g. "3 runs" summed into one costUsd) -- the
 * per-run breakdown was never preserved. This script can therefore only
 * backfill ONE ledger row per (org, feature, model) representing the full
 * aggregate, attributed to the org's most-recent Job/Application with a
 * matching JD file / resume file, when exactly one exists. It intentionally
 * SKIPS orgs where the job/application can't be attributed unambiguously
 * (e.g. multiple jobs, so we can't tell which one the aggregate belongs to)
 * -- those remain in the "Legacy" remainder rather than being backfilled
 * with a guess.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/backfill-jd-resume-usage-events.ts [--dry-run] [--org <orgId>]
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ORG_FILTER = (() => {
  const i = args.indexOf("--org");
  return i >= 0 ? args[i + 1] : null;
})();

type ByModelEntry = {
  provider?: string; model?: string; runs?: number;
  costUsd?: number; inputTokens?: number; cachedInputTokens?: number; outputTokens?: number;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function providerModel(key: string, entry: ByModelEntry): { provider: string; model: string } {
  if (entry.provider || entry.model) {
    return { provider: (entry.provider || "openai").toString(), model: (entry.model || "unknown").toString() };
  }
  const parts = key.split(":");
  if (parts.length >= 2) return { provider: parts[0], model: parts.slice(1).join(":") };
  return { provider: "openai", model: key || "unknown" };
}

type Row = {
  id: string;
  organizationId: string;
  feature: string;
  kind: string;
  provider: string;
  model: string;
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
  jobId: string | null;
  applicationId: string | null;
  jobTitle: string | null;
  candidateName: string | null;
  label: string | null;
  eventId: string;
  source: string;
  isTest: boolean;
  createdAt: Date;
};

let rowSeq = 0;
function makeRow(base: Omit<Row, "id">): Row {
  return { id: `evt_bfjd_${Date.now().toString(36)}_${(rowSeq++).toString(36)}`, ...base };
}

async function main() {
  console.log(`[backfill-jd-resume] start dry-run=${DRY_RUN} org=${ORG_FILTER ?? "(all)"}`);

  const orgs = await prisma.organizationDetails.findMany({
    where: { isDeleted: false, ...(ORG_FILTER ? { id: ORG_FILTER } : {}) },
    select: { id: true, name: true, platformUsageMetrics: true },
  });

  let emitted = 0;
  let inserted = 0;
  let skippedAmbiguous = 0;
  const batch: Row[] = [];

  for (const org of orgs) {
    const usageMetrics = (org.platformUsageMetrics && typeof org.platformUsageMetrics === "object")
      ? (org.platformUsageMetrics as Record<string, any>) : {};
    const billing = (usageMetrics.billing && typeof usageMetrics.billing === "object")
      ? (usageMetrics.billing as Record<string, any>) : {};

    const jdBucket = billing.jdExtraction;
    const resumeExtractBucket = billing.resumeExtraction;
    const resumeReportBucket = billing.resumeReport;

    const hasJd = jdBucket && num(jdBucket.costUsd) > 0;
    const hasResumeExtract = resumeExtractBucket && num(resumeExtractBucket.costUsd) > 0;
    const hasResumeReport = resumeReportBucket && num(resumeReportBucket.costUsd) > 0;
    if (!hasJd && !hasResumeExtract && !hasResumeReport) continue;

    // Already-attributed ledger rows for this org+feature -- skip if any exist
    // (this org's future events are already tracked; only backfill the gap).
    const existingFeatures = await prisma.usageEvent.groupBy({
      by: ["feature"],
      where: { organizationId: org.id, feature: { in: ["jdExtraction", "resumeExtraction", "resumeReport"] } },
    });
    const alreadyTracked = new Set(existingFeatures.map((f) => f.feature));

    // JD extraction: attribute to the org's single Job with a jdFileName, if unambiguous.
    if (hasJd && !alreadyTracked.has("jdExtraction")) {
      const jobsWithJd = await prisma.job.findMany({
        where: { organizationId: org.id, isDeleted: false, jdFileName: { not: null } },
        select: { id: true, title: true, jdFileName: true },
        take: 2,
      });
      if (jobsWithJd.length === 1) {
        const job = jobsWithJd[0];
        for (const [key, entry] of Object.entries(jdBucket.byModel || {})) {
          const e = entry as ByModelEntry;
          const { provider, model } = providerModel(key, e);
          batch.push(makeRow({
            organizationId: org.id, feature: "jdExtraction", kind: "llm", provider, model,
            calls: num(e.runs) || 1, inputTokens: num(e.inputTokens), cachedInputTokens: num(e.cachedInputTokens),
            outputTokens: num(e.outputTokens), costUsd: num(e.costUsd),
            jobId: job.id, applicationId: null, jobTitle: job.title, candidateName: null,
            label: job.jdFileName, eventId: `backfill-jd:${org.id}:${job.id}:${provider}:${model}`,
            source: "backfill", isTest: false, createdAt: new Date(),
          }));
        }
      } else {
        skippedAmbiguous++;
        console.log(`[backfill-jd-resume] org=${org.id} skipping jdExtraction: ${jobsWithJd.length} candidate jobs (ambiguous)`);
      }
    }

    // Resume extraction + resume report: attribute to the org's single Application, if unambiguous.
    if ((hasResumeExtract && !alreadyTracked.has("resumeExtraction")) || (hasResumeReport && !alreadyTracked.has("resumeReport"))) {
      const apps = await prisma.application.findMany({
        where: { job: { organizationId: org.id, isDeleted: false }, isDeleted: false },
        select: { id: true, candidateFullName: true, resumeFileName: true, job: { select: { id: true, title: true } } },
        take: 2,
      });
      if (apps.length === 1) {
        const app = apps[0];
        if (hasResumeExtract && !alreadyTracked.has("resumeExtraction")) {
          for (const [key, entry] of Object.entries(resumeExtractBucket.byModel || {})) {
            const e = entry as ByModelEntry;
            const { provider, model } = providerModel(key, e);
            batch.push(makeRow({
              organizationId: org.id, feature: "resumeExtraction", kind: "llm", provider, model,
              calls: num(e.runs) || 1, inputTokens: num(e.inputTokens), cachedInputTokens: num(e.cachedInputTokens),
              outputTokens: num(e.outputTokens), costUsd: num(e.costUsd),
              jobId: app.job?.id ?? null, applicationId: app.id, jobTitle: app.job?.title ?? null,
              candidateName: app.candidateFullName, label: app.resumeFileName,
              eventId: `backfill-resume:${org.id}:${app.id}:${provider}:${model}`,
              source: "backfill", isTest: false, createdAt: new Date(),
            }));
          }
        }
        if (hasResumeReport && !alreadyTracked.has("resumeReport")) {
          for (const [key, entry] of Object.entries(resumeReportBucket.byModel || {})) {
            const e = entry as ByModelEntry;
            const { provider, model } = providerModel(key, e);
            batch.push(makeRow({
              organizationId: org.id, feature: "resumeReport", kind: "llm", provider, model,
              calls: num(e.runs) || 1, inputTokens: num(e.inputTokens), cachedInputTokens: num(e.cachedInputTokens),
              outputTokens: num(e.outputTokens), costUsd: num(e.costUsd),
              jobId: app.job?.id ?? null, applicationId: app.id, jobTitle: app.job?.title ?? null,
              candidateName: app.candidateFullName, label: app.resumeFileName,
              eventId: `backfill-resumereport:${org.id}:${app.id}:${provider}:${model}`,
              source: "backfill", isTest: false, createdAt: new Date(),
            }));
          }
        }
      } else {
        skippedAmbiguous++;
        console.log(`[backfill-jd-resume] org=${org.id} skipping resumeExtraction/resumeReport: ${apps.length} candidate applications (ambiguous)`);
      }
    }
  }

  emitted = batch.length;
  if (!DRY_RUN && batch.length > 0) {
    const res = await prisma.usageEvent.createMany({ data: batch, skipDuplicates: true });
    inserted = res.count;
  }

  console.log(`\n[backfill-jd-resume] DONE. emitted=${emitted} rows, inserted=${inserted}, skippedAmbiguous=${skippedAmbiguous}${DRY_RUN ? " (dry-run: nothing written)" : ""}`);
}

main()
  .catch((e) => {
    console.error("[backfill-jd-resume] failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
