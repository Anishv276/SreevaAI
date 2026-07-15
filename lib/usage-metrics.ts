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
  "BILLING_INR_PER_USD", "CARTESIA_TTS_USD_PER_MILLION_CHARS", "ELEVENLABS_TTS_USD_PER_MILLION_CHARS",
];

function billingSubprocessEnv(): NodeJS.ProcessEnv {
  const env = { NODE_ENV: process.env.NODE_ENV } as NodeJS.ProcessEnv;
  for (const key of BILLING_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function runBillingCommand(command: string, payload: Record<string, unknown>) {
  return new Promise<void>((resolve, reject) => {
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
      let parsed: { ok?: boolean; error?: string } | null = null;
      try {
        parsed = stdout.trim() ? JSON.parse(stdout.trim().split(/\r?\n/).at(-1) || "{}") : null;
      } catch {
        parsed = null;
      }
      if (code === 0 && parsed?.ok !== false) {
        resolve();
        return;
      }
      const errorMsg = parsed?.error || stderr?.trim() || `billing command ${command} failed with code ${code}`;
      console.error(`[usage-metrics] billing subprocess error: ${errorMsg}`);
      reject(new Error(errorMsg));
    });
    child.stdin.end(JSON.stringify(payload));
  });
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
// Shared per-org usage breakdown -- the single calculation used by both the
// live super-admin usage view (app/api/super-admin/orgs/[id]/usage/route.ts)
// and the OrgUsageSummary refresh (scripts/refresh-org-usage-summary.ts). Keep
// this the only place that reads platformUsageMetrics.billing + UsageEvent so
// the two can never disagree on a number.
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
  interviewBriefCostUsd: number;
  interviewGenerationCostUsd: number;
  interviewTtsCostUsd: number;
  interviewSttCostUsd: number;
  interviewTtsCalls: number;
  interviewSttCalls: number;
  interviewReportCostUsd: number;
  totalCostUsd: number;
};

/**
 * Compute the full per-org cost breakdown from platformUsageMetrics (source of
 * truth for totals) plus the UsageEvent ledger (per-feature calls). Pass an
 * already-fetched org row to avoid a redundant query when the caller already
 * has one (e.g. the live usage-view route).
 */
export async function computeOrgUsageBreakdown(org: {
  id: string;
  name: string;
  platformUsageMetrics: unknown;
}): Promise<OrgUsageBreakdown> {
  const usageMetrics = (org.platformUsageMetrics && typeof org.platformUsageMetrics === "object")
    ? (org.platformUsageMetrics as Record<string, any>) : {};
  const billing = (usageMetrics.billing && typeof usageMetrics.billing === "object")
    ? (usageMetrics.billing as Record<string, UsageBucket>) : {};
  const B = (k: string): UsageBucket => billing[k] || {};

  const jdBucket = B("jdExtraction");
  const resumeBucket = B("resumeExtraction");
  const resumeReportBucket = B("resumeReport");
  const interviewBucket = B("interview"); // eval/live-session LLM + TTS + STT share this bucket
  const briefBucket = B("interviewBrief");
  const genBucket = B("interviewLLMGeneration");
  const reportBucket = B("interviewReport");

  const interviewLlmCostUsd = numOr0(interviewBucket.costUsd);
  const interviewTtsCostUsd = numOr0(interviewBucket.ttsCostUsd);
  const interviewSttCostUsd = numOr0(interviewBucket.sttCostUsd);
  const interviewBriefCostUsd = numOr0(briefBucket.costUsd);
  const interviewGenerationCostUsd = numOr0(genBucket.costUsd);
  const interviewReportCostUsd = numOr0(reportBucket.costUsd);
  const jdExtractionCostUsd = numOr0(jdBucket.costUsd);
  const resumeExtractionCostUsd = numOr0(resumeBucket.costUsd);
  const resumeReportCostUsd = numOr0(resumeReportBucket.costUsd);

  const totalCostUsd = roundCost(
    jdExtractionCostUsd + resumeExtractionCostUsd + resumeReportCostUsd +
    interviewLlmCostUsd + interviewTtsCostUsd + interviewSttCostUsd +
    interviewBriefCostUsd + interviewGenerationCostUsd + interviewReportCostUsd
  );

  return {
    orgId: org.id,
    orgName: org.name,
    jdExtractionCostUsd: roundCost(jdExtractionCostUsd),
    jdExtractionRuns: numOr0(jdBucket.runs),
    resumeExtractionCostUsd: roundCost(resumeExtractionCostUsd),
    resumeReportCostUsd: roundCost(resumeReportCostUsd),
    resumeRuns: numOr0(resumeBucket.runs) + numOr0(resumeReportBucket.runs),
    interviewLlmCostUsd: roundCost(interviewLlmCostUsd),
    interviewEvalCostUsd: roundCost(interviewLlmCostUsd), // eval IS the interview bucket's LLM cost
    interviewBriefCostUsd: roundCost(interviewBriefCostUsd),
    interviewGenerationCostUsd: roundCost(interviewGenerationCostUsd),
    interviewTtsCostUsd: roundCost(interviewTtsCostUsd),
    interviewSttCostUsd: roundCost(interviewSttCostUsd),
    interviewTtsCalls: callsFromByModel(interviewBucket.ttsByModel),
    interviewSttCalls: callsFromByModel(interviewBucket.sttByModel),
    interviewReportCostUsd: roundCost(interviewReportCostUsd),
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
    select: { id: true, name: true, platformUsageMetrics: true },
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
      interviewBriefCostUsd: b.interviewBriefCostUsd,
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
      interviewBriefCostUsd: b.interviewBriefCostUsd,
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
