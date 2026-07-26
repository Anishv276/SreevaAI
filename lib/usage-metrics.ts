import { spawn } from "child_process";
import path from "path";
import { getPythonExecutable } from "./python-exec";
import { prisma } from "./prisma";

// billing/billing.py lives under livekit-python-agent (see commit 82e7fba)
const BILLING_CWD = path.join(process.cwd(), "livekit-python-agent");

// chatbot removed: feature is no longer active
export type BillingFeature =
  | "interview"
  | "resumeExtraction"
  | "jdExtraction"
  | "questionBank"
  | "resumeReport"
  | "interviewReport";

// Optional ledger-context envelope. Rides inside the usage payload and is
// consumed by billing.py's LedgerWriter to attribute per-event UsageEvent rows
// (job/candidate names, idempotency eventId, ledgerFeature override). Older
// billing.py deployments simply ignore it, so it is safe across deploy skew.
type BillingContext = {
  eventId?: string | null;
  jobId?: string | null;
  applicationId?: string | null;
  interviewId?: string | null;
  jobTitle?: string | null;
  candidateName?: string | null;
  label?: string | null;
  ledgerFeature?: string | null;
  source?: "live" | "backfill" | null;
};

type BillingUsage = {
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  sessionDuration?: number;
  // Marks this as an embeddings call (e.g. scorer.py's semantic matching)
  // rather than a chat-completion call -- billing.py's LedgerWriter uses this
  // to tag the ledger row kind="embedding" instead of "llm" so the usage view
  // can show it as its own distinct call rather than folding it into the LLM
  // row's count.
  isEmbedding?: boolean;
  ttsRuns?: number;
  ttsCharacters?: number;
  ttsProvider?: string | null;
  ttsModel?: string | null;
  sttRuns?: number;
  sttAudioSeconds?: number;
  sttProvider?: string | null;
  sttModel?: string | null;
  eventId?: string | null;
  recordedAt?: string | null;
  context?: BillingContext;
};

function hasBillableUsage(usage: BillingUsage) {
  return (
    Number(usage.inputTokens || 0) > 0 ||
    Number(usage.outputTokens || 0) > 0 ||
    Number(usage.cachedInputTokens || 0) > 0 ||
    Number(usage.ttsCharacters || 0) > 0 ||
    Number(usage.sttAudioSeconds || 0) > 0 ||
    Number(usage.sessionDuration || 0) > 0
  );
}

// Only the env vars billing.py actually reads (DB connection + optional cost
// overrides) plus what the interpreter itself needs to run -- not the full
// parent environment, which holds every other secret (JWT_SECRET, API keys
// for providers this subprocess never talks to, etc).
//
// USERPROFILE/APPDATA/LOCALAPPDATA/SystemRoot are required on Windows: Node's
// process.env has no "HOME" at all there (it's a Unix convention -- only
// present if a Git Bash-style shell injected it into this specific process),
// so without these Python can't resolve %APPDATA%\Python\Python3xx\site-packages
// and every third-party import (pydantic, asyncpg, ...) fails with
// ModuleNotFoundError. SystemRoot specifically is required by the Windows/CRT
// process loader itself, not just for site-packages resolution -- confirmed by
// reproducing this exact failure with a minimal spawn() env missing SystemRoot.
// Both failures are silent and non-deterministic in production: whether they
// happen at all depends on how the parent Node process was launched (a Git
// Bash-initialized terminal happens to carry HOME and masks the bug; a plain
// `npm run dev`/`npm run worker` from Explorer or a service does not).
const BILLING_ENV_ALLOWLIST = [
  "PATH", "PYTHONPATH", "PYTHONHOME", "HOME", "TEMP", "TMP",
  "USERPROFILE", "APPDATA", "LOCALAPPDATA", "SystemRoot",
  "DATABASE_URL", "DIRECT_URL",
  "BILLING_INR_PER_USD", "ELEVENLABS_TTS_USD_PER_MILLION_CHARS",
];

function billingSubprocessEnv(): NodeJS.ProcessEnv {
  const env = { NODE_ENV: process.env.NODE_ENV } as NodeJS.ProcessEnv;
  for (const key of BILLING_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function runBillingCommandRaw(command: string, payload: Record<string, unknown>) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(getPythonExecutable(), ["-m", "billing.billing", command], {
      cwd: BILLING_CWD,
      env: billingSubprocessEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      let parsed: { ok?: boolean; error?: string;[k: string]: unknown } | null = null;
      try {
        parsed = stdout.trim() ? JSON.parse(stdout.trim().split(/\r?\n/).at(-1) || "{}") : null;
      } catch {
        parsed = null;
      }
      if (code === 0 && parsed?.ok !== false) {
        resolve(parsed || {});
        return;
      }
      const errorMsg = parsed?.error || stderr?.trim() || `billing command ${command} failed with code ${code}`;
      console.error(`[usage-metrics] billing subprocess error: ${errorMsg}`);
      reject(new Error(errorMsg));
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

async function runBillingCommand(command: string, payload: Record<string, unknown>): Promise<void> {
  await runBillingCommandRaw(command, payload);
}

// Priced OpenAI usage entry -- shape returned by billing.py's _llm_entry(),
// the same per-model shape every ledger stores (UsageEvent, and DemoTemplate/
// DemoSession's usageJson columns).
export type PricedLlmEntry = {
  model: string;
  provider: string;
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/** Price one OpenAI usage dict via billing.py's ONE rate table (_OPENAI_RATES)
 * without writing anything to the DB or requiring an orgId. Used by callers
 * that have no OrganizationDetails row to bill against (demo templates) but
 * still want the exact same pricing logic as every other feature. */
export async function priceLlmUsage(usage: {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}): Promise<PricedLlmEntry> {
  const result = await runBillingCommandRaw("price-llm-usage", { usage });
  return result.entry as PricedLlmEntry;
}

export function usageFromOpenAICompletion(completion: {
  model?: string | null;
  usage?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    prompt_tokens_details?: {
      cached_tokens?: number | null;
    } | null;
  } | null;
}) {
  return {
    model: completion.model ?? null,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
    cachedInputTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

export async function recordOrgBillingUsage(opts: {
  orgId: string;
  feature: BillingFeature;
  usage: BillingUsage;
}) {
  const { orgId, feature, usage } = opts;
  if (!hasBillableUsage(usage)) {
    throw new Error(`[usage-metrics] Refusing to record empty billing usage for org=${orgId} feature=${feature}`);
  }
  await runBillingCommand("record-org-usage", { orgId, feature, usage });
}

export async function recordOrgBillingFromOpenAICompletion(opts: {
  orgId: string;
  feature: BillingFeature;
  completion: Parameters<typeof usageFromOpenAICompletion>[0];
}) {
  await recordOrgBillingUsage({
    orgId: opts.orgId,
    feature: opts.feature,
    usage: usageFromOpenAICompletion(opts.completion),
  });
}

export async function deductInterviewQuotaForApplication(opts: {
  applicationId: string;
  durationSeconds?: number | null;
}) {
  await runBillingCommand("deduct-interview-quota", {
    applicationId: opts.applicationId,
    durationSeconds: opts.durationSeconds ?? null,
  });
}

// ============================================================================
// Shared per-org usage aggregation -- the single calculation used by the live
// super-admin usage view (app/api/super-admin/orgs/[id]/usage/route.ts), the
// platform billing dashboard (app/api/super-admin/billing/route.ts), and the
// OrgUsageSummary refresh (scripts/refresh-org-usage-summary.ts). UsageEvent is
// the sole source of truth: every cost/call/model number below is summed out of
// the entity rows' `usage` JSON, so no two surfaces can disagree.
// ============================================================================

export type UsageBucket = {
  runs?: number; inputTokens?: number; outputTokens?: number; costUsd?: number;
  ttsCharacters?: number; ttsCostUsd?: number; sttAudioSeconds?: number; sttCostUsd?: number;
  byModel?: Record<string, any>; ttsByModel?: Record<string, any>; sttByModel?: Record<string, any>;
};

export function numOr0(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export const roundCost = (v: number) => Math.round(v * 1e6) / 1e6;
export const clampLegacyCost = (blob: number, ledger: number) => Math.max(0, roundCost(blob - ledger));

// Primary model = highest-cost entry in a byModel map (provider prefix stripped).
export function primaryModelFromByModel(byModel: Record<string, any> | null | undefined): string | null {
  if (!byModel || typeof byModel !== "object") return null;
  let best: string | null = null;
  let bestCost = -1;
  for (const [key, v] of Object.entries(byModel)) {
    const cost = numOr0((v as any)?.costUsd);
    if (cost > bestCost) {
      bestCost = cost;
      const parts = key.split(":");
      best = parts.length >= 2 ? parts.slice(1).join(":") : key;
    }
  }
  return best;
}

// Real call count for a byModel map -- sums each entry's own `runs`/`sessions`
// count rather than counting distinct models (Object.keys(...).length), which
// undercounts whenever multiple calls share one model.
function callsFromByModel(byModel: Record<string, any> | null | undefined): number {
  if (!byModel || typeof byModel !== "object") return 0;
  return Object.values(byModel).reduce(
    (sum, v) => sum + numOr0((v as any)?.runs ?? (v as any)?.sessions ?? (v as any)?.calls),
    0
  );
}

export type OrgUsageBreakdown = {
  orgId: string;
  orgName: string;
  jdExtractionCostUsd: number;
  jdExtractionRuns: number;
  resumeExtractionCostUsd: number;
  resumeReportCostUsd: number;
  resumeRuns: number;
  interviewLlmCostUsd: number; // live/eval session LLM (the "interview" blob bucket's own LLM cost)
  interviewEvalCostUsd: number;
  questionBankCostUsd: number;
  interviewGenerationCostUsd: number;
  interviewTtsCostUsd: number;
  interviewSttCostUsd: number;
  interviewTtsCalls: number;
  interviewSttCalls: number;
  interviewReportCostUsd: number;
  totalCostUsd: number;
};

// Per-feature aggregate summed out of one org's UsageEvent entity rows. The keys
// mirror the sub-feature keys inside each row's `usage` JSON. `calls` counts real
// API calls (summed from every model entry's `calls`); `byModel` accumulates
// provider:model -> {costUsd, calls, ...units} for the primary-model/pie views.
export type UsageEventAgg = {
  costUsd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  ttsCharacters: number;
  sttAudioSeconds: number;
  byModel: Record<string, { provider: string; model: string; costUsd: number; calls: number; characters: number; seconds: number; inputTokens: number; outputTokens: number }>;
};

// Sub-feature keys emitted by aggregateOrgUsageEvents (one bucket each).
export type UsageAggKey =
  | "jdExtraction" | "resumeExtraction" | "resumeReport" | "questionBank"
  | "eval" | "llmGeneration" | "report"
  | "interviewTts" | "interviewStt";

export type OrgUsageEventRow = { feature: string; usage: unknown };

function emptyAgg(): UsageEventAgg {
  return { costUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0, ttsCharacters: 0, sttAudioSeconds: 0, byModel: {} };
}

function foldLlm(agg: UsageEventAgg, arr: any[]) {
  for (const m of arr) {
    const calls = numOr0(m.calls);
    const key = `${String(m.provider || "openai")}:${String(m.model || "unknown")}`;
    const bm = (agg.byModel[key] ??= { provider: String(m.provider || "openai"), model: String(m.model || "unknown"), costUsd: 0, calls: 0, characters: 0, seconds: 0, inputTokens: 0, outputTokens: 0 });
    bm.costUsd += numOr0(m.costUsd); bm.calls += calls;
    bm.inputTokens += numOr0(m.inputTokens); bm.outputTokens += numOr0(m.outputTokens);
    agg.costUsd += numOr0(m.costUsd); agg.calls += calls;
    agg.inputTokens += numOr0(m.inputTokens); agg.outputTokens += numOr0(m.outputTokens);
  }
}

function foldAudio(agg: UsageEventAgg, arr: any[], unit: "characters" | "seconds") {
  for (const m of arr) {
    const calls = numOr0(m.calls);
    const key = `${String(m.provider || "unknown")}:${String(m.model || "unknown")}`;
    const bm = (agg.byModel[key] ??= { provider: String(m.provider || "unknown"), model: String(m.model || "unknown"), costUsd: 0, calls: 0, characters: 0, seconds: 0, inputTokens: 0, outputTokens: 0 });
    bm.costUsd += numOr0(m.costUsd); bm.calls += calls; bm[unit] += numOr0(m[unit]);
    agg.costUsd += numOr0(m.costUsd); agg.calls += calls;
    if (unit === "characters") agg.ttsCharacters += numOr0(m.characters);
    else agg.sttAudioSeconds += numOr0(m.seconds);
  }
}

/**
 * Aggregate one org's UsageEvent entity rows into a per-sub-feature map. This is
 * the single UsageEvent-reading routine every cost surface shares. `usage.jd/
 * resume/report/eval/brief/...` all funnel here so the numbers can't diverge.
 */
export function aggregateOrgUsageEvents(rows: OrgUsageEventRow[]): Record<UsageAggKey, UsageEventAgg> {
  const out: Record<UsageAggKey, UsageEventAgg> = {
    jdExtraction: emptyAgg(), resumeExtraction: emptyAgg(), resumeReport: emptyAgg(), questionBank: emptyAgg(),
    eval: emptyAgg(), llmGeneration: emptyAgg(), report: emptyAgg(),
    interviewTts: emptyAgg(), interviewStt: emptyAgg(),
  };
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  for (const row of rows) {
    const usage = (row.usage && typeof row.usage === "object") ? (row.usage as Record<string, any>) : {};
    if (row.feature === "jdExtraction") {
      foldLlm(out.jdExtraction, arr(usage.jdExtraction?.llm));
    } else if (row.feature === "resumeExtraction") {
      foldLlm(out.resumeExtraction, arr(usage.resumeExtraction?.llm));
      foldLlm(out.resumeReport, arr(usage.resumeReport?.llm));
    } else if (row.feature === "questionBank") {
      foldLlm(out.questionBank, arr(usage.questionBank?.llm));
    } else if (row.feature === "interview") {
      foldLlm(out.eval, arr(usage.eval?.llm));
      foldLlm(out.llmGeneration, arr(usage.llmGeneration?.llm));
      foldLlm(out.report, arr(usage.report?.llm));
      foldAudio(out.interviewTts, arr(usage.tts?.byModel), "characters");
      foldAudio(out.interviewStt, arr(usage.stt?.byModel), "seconds");
    }
  }
  return out;
}

/**
 * Compute the full per-org cost breakdown by summing the org's UsageEvent ledger
 * rows (real spend only — isTest rows are excluded by the caller's query).
 */
export async function computeOrgUsageBreakdown(org: {
  id: string;
  name: string;
}): Promise<OrgUsageBreakdown> {
  const rows = await prisma.usageEvent.findMany({
    where: { organizationId: org.id, isTest: false },
    select: { feature: true, usage: true },
  });
  const agg = aggregateOrgUsageEvents(rows);

  const totalCostUsd = roundCost(
    agg.jdExtraction.costUsd + agg.resumeExtraction.costUsd + agg.resumeReport.costUsd +
    agg.eval.costUsd + agg.interviewTts.costUsd + agg.interviewStt.costUsd +
    agg.questionBank.costUsd + agg.llmGeneration.costUsd + agg.report.costUsd
  );

  return {
    orgId: org.id,
    orgName: org.name,
    jdExtractionCostUsd: roundCost(agg.jdExtraction.costUsd),
    jdExtractionRuns: agg.jdExtraction.calls,
    resumeExtractionCostUsd: roundCost(agg.resumeExtraction.costUsd),
    resumeReportCostUsd: roundCost(agg.resumeReport.costUsd),
    resumeRuns: agg.resumeExtraction.calls + agg.resumeReport.calls,
    interviewLlmCostUsd: roundCost(agg.eval.costUsd),
    interviewEvalCostUsd: roundCost(agg.eval.costUsd),
    questionBankCostUsd: roundCost(agg.questionBank.costUsd),
    interviewGenerationCostUsd: roundCost(agg.llmGeneration.costUsd),
    interviewTtsCostUsd: roundCost(agg.interviewTts.costUsd),
    interviewSttCostUsd: roundCost(agg.interviewStt.costUsd),
    interviewTtsCalls: agg.interviewTts.calls,
    interviewSttCalls: agg.interviewStt.calls,
    interviewReportCostUsd: roundCost(agg.report.costUsd),
    totalCostUsd,
  };
}

// In-process debounce: skip a refresh if this org was already refreshed
// recently. The usage-view route calls refreshOrgUsageSummary on every page
// view (see refreshOrgUsageSummaryDebounced below); without this, rapid
// navigation/section-switching/React-StrictMode-double-fetch in dev opens
// several extra concurrent DB round-trips per second on top of the page's
// own queries, which starved the Prisma pool (max 10) and caused real
// "Connection terminated due to connection timeout" 500s.
const _lastRefreshedAt = new Map<string, number>();
const REFRESH_DEBOUNCE_MS = 2 * 60 * 1000;

/** Compute + upsert the OrgUsageSummary row for one org. */
export async function refreshOrgUsageSummary(orgId: string): Promise<OrgUsageBreakdown | null> {
  const org = await prisma.organizationDetails.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  });
  if (!org) return null;
  const b = await computeOrgUsageBreakdown(org);
  await prisma.orgUsageSummary.upsert({
    where: { orgId: b.orgId },
    create: {
      orgId: b.orgId,
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
  _lastRefreshedAt.set(orgId, Date.now());
  return b;
}

/**
 * Fire-and-forget-friendly variant for request paths (e.g. the usage-view API)
 * that want the summary table kept current without adding a DB round-trip on
 * every single page view. No-ops (and doesn't touch the DB at all) if this org
 * was refreshed within the last REFRESH_DEBOUNCE_MS.
 */
export function refreshOrgUsageSummaryDebounced(orgId: string): void {
  const last = _lastRefreshedAt.get(orgId) ?? 0;
  if (Date.now() - last < REFRESH_DEBOUNCE_MS) return;
  _lastRefreshedAt.set(orgId, Date.now()); // claim immediately so concurrent requests don't both fire
  refreshOrgUsageSummary(orgId).catch((err) =>
    console.error(`[usage-metrics] refreshOrgUsageSummaryDebounced failed for org=${orgId}:`, err)
  );
}

/** Refresh OrgUsageSummary for every non-deleted org. Returns the count refreshed. */
export async function refreshAllOrgUsageSummaries(): Promise<number> {
  const orgs = await prisma.organizationDetails.findMany({
    where: { isDeleted: false },
    select: { id: true },
  });
  let count = 0;
  for (const org of orgs) {
    const result = await refreshOrgUsageSummary(org.id);
    if (result) count++;
  }
  return count;
}
