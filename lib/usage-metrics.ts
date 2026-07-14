import { spawn } from "child_process";
import path from "path";
import { getPythonExecutable } from "./python-exec";

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
const BILLING_ENV_ALLOWLIST = [
  "PATH", "PYTHONPATH", "PYTHONHOME", "HOME", "TEMP", "TMP",
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
