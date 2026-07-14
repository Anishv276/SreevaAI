/**
 * scripts/backfill-usage-events.ts
 * ================================
 * One-off backfill of per-event UsageEvent ledger rows from existing
 * Interview.billingSnapshotAtCompletion data. Only interviews have per-entity
 * historical billing; older JD/resume/report costs are unknowable per-item and
 * are surfaced by the read API as a "Legacy (before detailed tracking)"
 * remainder (blob total minus ledger sum), so they are NOT backfilled here.
 *
 * For each non-test, non-deleted interview with a billing snapshot we emit:
 *   - one interviewSession/stt row per sttByModel entry
 *   - one interviewSession/tts row per ttsByModel entry
 *   - one interviewSession/llm row per llmByModel entry (historical snapshots
 *     lump eval+brief+llmgen together per model — the read UI labels these
 *     "Session LLM (pre-split history)"; exact sub-section TOTALS still come
 *     from the org blob's separate buckets, so accuracy is preserved).
 *
 * All rows are source="backfill" with deterministic eventIds
 *   backfill:<interviewId>:<kind>:<provider>:<model>
 * so re-runs are idempotent via createMany({ skipDuplicates: true }).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/backfill-usage-events.ts [--dry-run] [--org <orgId>]
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ca = readFileSync("./certs/supabase-root-ca.pem", "utf8");
const dbUrl = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL || "");
dbUrl.searchParams.set("uselibpqcompat", "true");
dbUrl.searchParams.delete("sslmode");
const adapter = new PrismaPg({ connectionString: dbUrl.toString(), ssl: { rejectUnauthorized: true, ca } });
const prisma = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ORG_FILTER = (() => {
  const i = args.indexOf("--org");
  return i >= 0 ? args[i + 1] : null;
})();

const PAGE_SIZE = 200;

type ByModel = Record<string, {
  provider?: string; model?: string; runs?: number; costUsd?: number;
  inputTokens?: number; cachedInputTokens?: number; outputTokens?: number;
  characters?: number; audioSeconds?: number;
}>;

type Snapshot = {
  candidateName?: string; jobTitle?: string;
  llmByModel?: ByModel; ttsByModel?: ByModel; sttByModel?: ByModel;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Split a "provider:model" byModel key or fall back to the entry's own fields. */
function providerModel(key: string, entry: { provider?: string; model?: string }): { provider: string; model: string } {
  if (entry.provider || entry.model) {
    return { provider: (entry.provider || "unknown").toString(), model: (entry.model || "unknown").toString() };
  }
  const parts = key.split(":");
  if (parts.length >= 2) return { provider: parts[0], model: parts.slice(1).join(":") };
  return { provider: "unknown", model: key || "unknown" };
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
  ttsCharacters: number;
  sttAudioSeconds: number;
  costUsd: number;
  applicationId: string | null;
  interviewId: string;
  jobTitle: string | null;
  candidateName: string | null;
  eventId: string;
  source: string;
  isTest: boolean;
  createdAt: Date;
};

let rowSeq = 0;
function makeRow(base: Omit<Row, "id">): Row {
  // Deterministic-ish id (cuid-like) is unnecessary; use a prefixed unique id.
  return { id: `evt_bf_${Date.now().toString(36)}_${(rowSeq++).toString(36)}`, ...base };
}

async function main() {
  console.log(`[backfill] start dry-run=${DRY_RUN} org=${ORG_FILTER ?? "(all)"}`);
  let cursor: string | null = null;
  let scanned = 0;
  let emitted = 0;
  let inserted = 0;
  const perOrg = new Map<string, number>();

  for (;;) {
    const interviews: Array<{
      id: string;
      applicationId: string;
      interviewCompletedAt: Date | null;
      interviewUpdatedAt: Date;
      billingSnapshotAtCompletion: unknown;
      application: { candidateFullName: string; job: { id: string; title: string; organizationId: string | null } };
    }> = await prisma.interview.findMany({
      where: {
        isDeleted: false,
        isTestSession: false,
        ...(ORG_FILTER ? { application: { job: { organizationId: ORG_FILTER } } } : {}),
      },
      select: {
        id: true,
        applicationId: true,
        interviewCompletedAt: true,
        interviewUpdatedAt: true,
        billingSnapshotAtCompletion: true,
        application: { select: { candidateFullName: true, job: { select: { id: true, title: true, organizationId: true } } } },
      },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (interviews.length === 0) break;
    cursor = interviews[interviews.length - 1].id;

    const batch: Row[] = [];
    for (const iv of interviews) {
      scanned++;
      const orgId = iv.application?.job?.organizationId;
      if (!orgId) continue;
      const snap = (iv.billingSnapshotAtCompletion && typeof iv.billingSnapshotAtCompletion === "object")
        ? (iv.billingSnapshotAtCompletion as Snapshot) : null;
      if (!snap) continue;

      const createdAt = iv.interviewCompletedAt ?? iv.interviewUpdatedAt ?? new Date();
      const candidateName = snap.candidateName || iv.application?.candidateFullName || null;
      const jobTitle = snap.jobTitle || iv.application?.job?.title || null;

      const common = {
        organizationId: orgId,
        applicationId: iv.applicationId,
        interviewId: iv.id,
        jobTitle,
        candidateName,
        source: "backfill",
        isTest: false,
        createdAt,
      };

      for (const [key, e] of Object.entries(snap.sttByModel || {})) {
        const { provider, model } = providerModel(key, e);
        batch.push(makeRow({
          ...common, feature: "interviewSession", kind: "stt", provider, model,
          calls: num(e.runs) || 1, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0,
          ttsCharacters: 0, sttAudioSeconds: num(e.audioSeconds), costUsd: num(e.costUsd),
          eventId: `backfill:${iv.id}:stt:${provider}:${model}`,
        }));
      }
      for (const [key, e] of Object.entries(snap.ttsByModel || {})) {
        const { provider, model } = providerModel(key, e);
        batch.push(makeRow({
          ...common, feature: "interviewSession", kind: "tts", provider, model,
          calls: num(e.runs) || 1, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0,
          ttsCharacters: num(e.characters), sttAudioSeconds: 0, costUsd: num(e.costUsd),
          eventId: `backfill:${iv.id}:tts:${provider}:${model}`,
        }));
      }
      for (const [key, e] of Object.entries(snap.llmByModel || {})) {
        const { provider, model } = providerModel(key, e);
        batch.push(makeRow({
          ...common, feature: "interviewSession", kind: "llm", provider, model,
          calls: num(e.runs) || 1, inputTokens: num(e.inputTokens),
          cachedInputTokens: num(e.cachedInputTokens), outputTokens: num(e.outputTokens),
          ttsCharacters: 0, sttAudioSeconds: 0, costUsd: num(e.costUsd),
          eventId: `backfill:${iv.id}:llm:${provider}:${model}`,
        }));
      }
    }

    emitted += batch.length;
    for (const r of batch) perOrg.set(r.organizationId, (perOrg.get(r.organizationId) || 0) + 1);

    if (!DRY_RUN && batch.length > 0) {
      const res = await prisma.usageEvent.createMany({ data: batch, skipDuplicates: true });
      inserted += res.count;
    }
    console.log(`[backfill] page: scanned=${scanned} emitted=${emitted} inserted=${inserted}`);
  }

  console.log(`\n[backfill] DONE. scanned=${scanned} interviews, emitted=${emitted} rows, inserted=${inserted}${DRY_RUN ? " (dry-run: nothing written)" : ""}`);
  console.log("[backfill] per-org row counts:");
  for (const [org, n] of [...perOrg.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${org}: ${n}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
