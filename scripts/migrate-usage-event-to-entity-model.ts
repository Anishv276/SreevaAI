/**
 * scripts/migrate-usage-event-to-entity-model.ts
 * ===============================================
 * Folds every legacy per-call "usage_event_legacy" row (the old flat
 * UsageEvent shape, renamed aside by the
 * 20260715204222_reshape_usage_event_entity_ledger migration) into the new
 * entity-level UsageEvent rows: one upserted row per jd:{jobId} |
 * resume:{applicationId} | interview:{applicationId|interviewId}, with a
 * `usage` JSON breakdown mirroring billing.py's EntityLedger merge shape.
 *
 * Supersedes scripts/backfill-usage-events.ts and
 * scripts/backfill-jd-resume-usage-events.ts (both targeted the old flat
 * shape and no longer apply).
 *
 * Idempotent: re-running just re-derives the same totals from
 * usage_event_legacy (ON CONFLICT eventId DO UPDATE), it does not double-count.
 * Safe to run before dropping usage_event_legacy; does NOT drop it itself.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/migrate-usage-event-to-entity-model.ts [--dry-run] [--org <orgId>]
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ORG_FILTER = (() => {
  const i = args.indexOf("--org");
  return i >= 0 ? args[i + 1] : null;
})();

type LegacyRow = {
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
  jobId: string | null;
  applicationId: string | null;
  interviewId: string | null;
  jobTitle: string | null;
  candidateName: string | null;
  isTest: boolean;
  createdAt: Date;
};

// feature -> interview usage sub-key, mirrors billing.py's _INTERVIEW_SUBKEY.
const INTERVIEW_SUBKEY: Record<string, string> = {
  interviewEval: "eval",
  interviewSession: "eval", // legacy session LLM rows had no sub-feature split
  interviewBrief: "brief",
  interviewLLMGeneration: "llmGeneration",
  interviewReport: "report",
};

type ModelEntry = {
  model: string; provider: string; calls: number;
  inputTokens: number; cachedInputTokens: number; outputTokens: number; costUsd: number;
};
type AudioEntry = {
  model: string; provider: string; calls: number; costUsd: number;
  characters?: number; seconds?: number;
};

/** Entity key -> accumulated usage fragment + row metadata, merged across all
 * legacy rows sharing that key before a single upsert per entity. */
type EntityAcc = {
  organizationId: string; feature: string;
  jobId: string | null; applicationId: string | null; interviewId: string | null;
  jobTitle: string | null; candidateName: string | null; isTest: boolean;
  createdAt: Date;
  usage: Record<string, any>;
};

function mergeModelArray(arr: ModelEntry[], entry: ModelEntry) {
  const existing = arr.find((e) => e.model === entry.model && e.provider === entry.provider);
  if (existing) {
    existing.calls += entry.calls;
    existing.inputTokens += entry.inputTokens;
    existing.cachedInputTokens += entry.cachedInputTokens;
    existing.outputTokens += entry.outputTokens;
    existing.costUsd = round8(existing.costUsd + entry.costUsd);
  } else {
    arr.push(entry);
  }
}

function mergeAudioArray(arr: AudioEntry[], entry: AudioEntry, unitKey: "characters" | "seconds") {
  const existing = arr.find((e) => e.model === entry.model && e.provider === entry.provider);
  if (existing) {
    existing.calls += entry.calls;
    existing[unitKey] = (existing[unitKey] || 0) + (entry[unitKey] || 0);
    existing.costUsd = round8(existing.costUsd + entry.costUsd);
  } else {
    arr.push(entry);
  }
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

function applyFragment(usage: Record<string, any>, sub: string, fragment: Record<string, any>) {
  const cur = (usage[sub] ??= {});
  if (fragment.llm) {
    const arr: ModelEntry[] = (cur.llm ??= []);
    for (const entry of fragment.llm) mergeModelArray(arr, entry);
  }
  if (fragment.byModel) {
    const unitKey: "characters" | "seconds" = sub === "tts" ? "characters" : "seconds";
    const arr: AudioEntry[] = (cur.byModel ??= []);
    for (const entry of fragment.byModel) mergeAudioArray(arr, entry, unitKey);
    cur[unitKey] = arr.reduce((s, m) => s + (m[unitKey] || 0), 0);
    cur.costUsd = round8(arr.reduce((s, m) => s + (m.costUsd || 0), 0));
  }
}

function sumUsageCost(usage: Record<string, any>): number {
  let total = 0;
  const walk = (node: any) => {
    if (Array.isArray(node)) { for (const v of node) walk(v); return; }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (k === "costUsd") total += Number(v) || 0;
        else walk(v);
      }
    }
  };
  walk(usage);
  return round8(total);
}

async function main() {
  console.log(`[migrate-entity] start dry-run=${DRY_RUN} org=${ORG_FILTER ?? "(all)"}`);

  const legacyExists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usage_event_legacy') AS "exists"`
  );
  if (!legacyExists[0]?.exists) {
    console.log("[migrate-entity] usage_event_legacy not found — nothing to migrate (already dropped or migration not applied yet).");
    await prisma.$disconnect();
    return;
  }

  const whereOrg = ORG_FILTER ? `WHERE "organizationId" = $1` : "";
  const legacyRows = await prisma.$queryRawUnsafe<LegacyRow[]>(
    `SELECT "id","organizationId","feature","kind","provider","model","calls",
            "inputTokens","cachedInputTokens","outputTokens","ttsCharacters","sttAudioSeconds",
            "costUsd","jobId","applicationId","interviewId","jobTitle","candidateName",
            "isTest","createdAt"
     FROM "usage_event_legacy" ${whereOrg}
     ORDER BY "createdAt" ASC`,
    ...(ORG_FILTER ? [ORG_FILTER] : [])
  );
  console.log(`[migrate-entity] scanned ${legacyRows.length} legacy rows`);

  const byEntity = new Map<string, EntityAcc>();

  for (const r of legacyRows) {
    let entityFeature: string;
    let eventId: string;
    let sub: string | null = null;
    let jobId = r.jobId;
    let applicationId = r.applicationId;
    let interviewId = r.interviewId;

    if (r.feature === "jdExtraction") {
      if (!jobId) continue; // unattributable — leave in legacy, matches old "Legacy" reconciliation behaviour
      entityFeature = "jdExtraction";
      eventId = `jd:${jobId}`;
      sub = "jdExtraction";
    } else if (r.feature === "resumeExtraction" || r.feature === "resumeReport") {
      if (!applicationId) continue;
      entityFeature = "resumeExtraction";
      eventId = `resume:${applicationId}`;
      sub = r.feature;
    } else {
      // interview / interviewEval / interviewBrief / interviewLLMGeneration /
      // interviewReport / interviewSession (tts/stt/llm rows)
      const keyId = interviewId || applicationId;
      if (!keyId) continue;
      entityFeature = "interview";
      eventId = `interview:${keyId}`;
      if (r.kind === "tts" || r.kind === "stt") {
        sub = r.kind;
      } else {
        sub = INTERVIEW_SUBKEY[r.feature] || "eval";
      }
    }

    let acc = byEntity.get(eventId);
    if (!acc) {
      acc = {
        organizationId: r.organizationId, feature: entityFeature,
        jobId, applicationId, interviewId,
        jobTitle: r.jobTitle, candidateName: r.candidateName, isTest: r.isTest,
        createdAt: r.createdAt, usage: {},
      };
      byEntity.set(eventId, acc);
    } else {
      acc.jobId ??= jobId;
      acc.applicationId ??= applicationId;
      acc.interviewId ??= interviewId;
      acc.jobTitle ??= r.jobTitle;
      acc.candidateName ??= r.candidateName;
      if (r.createdAt < acc.createdAt) acc.createdAt = r.createdAt;
    }

    if (r.kind === "tts") {
      applyFragment(acc.usage, "tts", {
        byModel: [{ model: r.model, provider: r.provider, calls: r.calls, characters: r.ttsCharacters, costUsd: r.costUsd }],
      });
    } else if (r.kind === "stt") {
      applyFragment(acc.usage, "stt", {
        byModel: [{ model: r.model, provider: r.provider, calls: r.calls, seconds: r.sttAudioSeconds, costUsd: r.costUsd }],
      });
    } else {
      // llm | embedding — folded into the sub-feature's llm array either way
      // (embedding calls are resume-report semantic-matching cost, same bucket).
      applyFragment(acc.usage, sub!, {
        llm: [{
          model: r.model, provider: r.provider, calls: r.calls,
          inputTokens: r.inputTokens, cachedInputTokens: r.cachedInputTokens,
          outputTokens: r.outputTokens, costUsd: r.costUsd,
        }],
      });
    }
  }

  console.log(`[migrate-entity] folded into ${byEntity.size} entity rows`);

  let upserted = 0;
  for (const [eventId, acc] of byEntity) {
    const costUsd = sumUsageCost(acc.usage);
    if (DRY_RUN) {
      console.log(`[migrate-entity] (dry-run) would upsert ${eventId} org=${acc.organizationId} feature=${acc.feature} costUsd=${costUsd}`);
      continue;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "UsageEvent"
         ("id","organizationId","feature","jobId","applicationId","interviewId",
          "jobTitle","candidateName","isTest","usage","costUsd","eventId","createdAt","updatedAt")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,NOW())
       ON CONFLICT ("eventId") DO UPDATE SET
         "usage" = $9::jsonb, "costUsd" = $10,
         "jobTitle" = COALESCE("UsageEvent"."jobTitle", $6),
         "candidateName" = COALESCE("UsageEvent"."candidateName", $7),
         "jobId" = COALESCE("UsageEvent"."jobId", $3),
         "applicationId" = COALESCE("UsageEvent"."applicationId", $4),
         "interviewId" = COALESCE("UsageEvent"."interviewId", $5),
         "updatedAt" = NOW()`,
      acc.organizationId, acc.feature, acc.jobId, acc.applicationId, acc.interviewId,
      acc.jobTitle, acc.candidateName, acc.isTest, JSON.stringify(acc.usage), costUsd,
      eventId, acc.createdAt
    );
    upserted++;
  }

  console.log(`\n[migrate-entity] DONE. legacyRows=${legacyRows.length} entities=${byEntity.size} upserted=${upserted}${DRY_RUN ? " (dry-run: nothing written)" : ""}`);
  console.log(`[migrate-entity] Once verified, drop the snapshot with: DROP TABLE "usage_event_legacy";`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("[migrate-entity] failed:", e);
  process.exitCode = 1;
});
