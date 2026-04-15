import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type BillingFeature =
  | "interview"
  | "resumeExtraction"
  | "jdExtraction"
  | "chatbot"
  | "resumeReport"
  | "interviewReport"
  | "general";

const BILLING_FEATURES: BillingFeature[] = [
  "interview",
  "resumeExtraction",
  "jdExtraction",
  "chatbot",
  "resumeReport",
  "interviewReport",
  "general",
];

type ModelCostRate = {
  input: number;
  cachedInput: number;
  output: number;
};

type FeatureModelMetrics = {
  runs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  sessionDuration: number;
  costUsd: number;
};

type TtsModelMetrics = {
  runs: number;
  characters: number;
  costUsd: number;
};

type SttModelMetrics = {
  runs: number;
  audioSeconds: number;
  costUsd: number;
};

type BillingFeatureMetrics = {
  runs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  sessionDuration: number;
  costUsd: number;
  ttsRuns: number;
  ttsCharacters: number;
  ttsCostUsd: number;
  sttRuns: number;
  sttAudioSeconds: number;
  sttCostUsd: number;
  byModel: Record<string, FeatureModelMetrics>;
  ttsByModel: Record<string, TtsModelMetrics>;
  sttByModel: Record<string, SttModelMetrics>;
};

const MODEL_RATES: Record<string, ModelCostRate> = {
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
};

const emptyFeature = () => ({
  runs: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  sessionDuration: 0,
  costUsd: 0,
  ttsRuns: 0,
  ttsCharacters: 0,
  ttsCostUsd: 0,
  sttRuns: 0,
  sttAudioSeconds: 0,
  sttCostUsd: 0,
  byModel: {} as Record<string, FeatureModelMetrics>,
  ttsByModel: {} as Record<string, TtsModelMetrics>,
  sttByModel: {} as Record<string, SttModelMetrics>,
}) satisfies BillingFeatureMetrics;

export const emptyBillingMetrics = () => ({
  interview: emptyFeature(),
  resumeExtraction: emptyFeature(),
  jdExtraction: emptyFeature(),
  chatbot: emptyFeature(),
  resumeReport: emptyFeature(),
  interviewReport: emptyFeature(),
  general: emptyFeature(),
});

function normalizeModelName(model: string | undefined | null) {
  return (model || "").trim().toLowerCase();
}

function getRate(model: string | undefined | null): ModelCostRate {
  const key = normalizeModelName(model);
  return MODEL_RATES[key] || MODEL_RATES["gpt-4o-mini"];
}

export function estimateOpenAICost(opts: {
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}) {
  const rate = getRate(opts.model);
  const inputTokens = Math.max(0, opts.inputTokens ?? 0);
  const outputTokens = Math.max(0, opts.outputTokens ?? 0);
  const cachedInputTokens = Math.max(0, Math.min(opts.cachedInputTokens ?? 0, inputTokens));

  const inputCost = ((inputTokens - cachedInputTokens) / 1_000_000) * rate.input;
  const cachedCost = (cachedInputTokens / 1_000_000) * rate.cachedInput;
  const outputCost = (outputTokens / 1_000_000) * rate.output;

  return Math.max(0, inputCost + cachedCost + outputCost);
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
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;
  const cachedTokens = completion.usage?.prompt_tokens_details?.cached_tokens ?? 0;

  return {
    model: completion.model ?? "gpt-4o-mini",
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    cachedInputTokens: cachedTokens,
  };
}

export function mergeBillingFeature(
  billing: ReturnType<typeof emptyBillingMetrics>,
  feature: BillingFeature,
  usage: {
    model?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    sessionDuration?: number;
  },
) {
  const bucket = billing[feature];
  const modelKey = normalizeModelName(usage.model) || "unknown";
  const costUsd = estimateOpenAICost(usage);

  bucket.runs += 1;
  bucket.inputTokens += usage.inputTokens ?? 0;
  bucket.cachedInputTokens += usage.cachedInputTokens ?? 0;
  bucket.outputTokens += usage.outputTokens ?? 0;
  bucket.sessionDuration += usage.sessionDuration ?? 0;
  bucket.costUsd += costUsd;

  if (!bucket.byModel[modelKey]) {
    bucket.byModel[modelKey] = {
      runs: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      sessionDuration: 0,
      costUsd: 0,
    };
  }

  const modelBucket = bucket.byModel[modelKey]!;
  modelBucket.runs += 1;
  modelBucket.inputTokens += usage.inputTokens ?? 0;
  modelBucket.cachedInputTokens += usage.cachedInputTokens ?? 0;
  modelBucket.outputTokens += usage.outputTokens ?? 0;
  modelBucket.sessionDuration += usage.sessionDuration ?? 0;
  modelBucket.costUsd += costUsd;

  return billing;
}

function coerceBillingMetrics(value: unknown) {
  const base = emptyBillingMetrics();
  if (!value || typeof value !== "object") return base;

  const incoming = value as Record<string, unknown>;
  for (const feature of BILLING_FEATURES) {
    const src = incoming[feature] as (BillingFeatureMetrics & {
      byModel?: Record<string, unknown>;
    }) | undefined;
    if (!src || typeof src !== "object") continue;
    const dst = base[feature];
    dst.runs = Number(src.runs || 0);
    dst.inputTokens = Number(src.inputTokens || 0);
    dst.cachedInputTokens = Number(src.cachedInputTokens || 0);
    dst.outputTokens = Number(src.outputTokens || 0);
    dst.sessionDuration = Number(src.sessionDuration || 0);
    dst.costUsd = Number(src.costUsd || 0);
    dst.ttsRuns = Number(src.ttsRuns || 0);
    dst.ttsCharacters = Number(src.ttsCharacters || 0);
    dst.ttsCostUsd = Number(src.ttsCostUsd || 0);
    dst.sttRuns = Number(src.sttRuns || 0);
    dst.sttAudioSeconds = Number(src.sttAudioSeconds || 0);
    dst.sttCostUsd = Number(src.sttCostUsd || 0);
    dst.byModel = { ...(src.byModel || {}) };
    dst.ttsByModel = { ...(src.ttsByModel || {}) };
    dst.sttByModel = { ...(src.sttByModel || {}) };
  }
  return base;
}

export async function recordOrgBillingUsage(opts: {
  orgId: string;
  feature: BillingFeature;
  usage: {
    model?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    sessionDuration?: number;
  };
}) {
  const { orgId, feature, usage } = opts;
  const org = (await (prisma.organization as any).findUnique({
    where: { id: orgId },
    select: { usageMetrics: true },
  })) as any;

  if (!org) return;

  const existingUsage =
    org.usageMetrics && typeof org.usageMetrics === "object"
      ? (org.usageMetrics as Record<string, unknown>)
      : {};
  const billing = coerceBillingMetrics(existingUsage.billing);
  mergeBillingFeature(billing, feature, usage);

  const updatedUsage: Record<string, unknown> = {
    ...existingUsage,
    billing,
    updatedAt: new Date().toISOString(),
  };

  await (prisma.organization as any).update({
    where: { id: orgId },
    data: {
      usageMetrics: updatedUsage as Prisma.InputJsonValue,
    },
  });
}

export async function recordOrgBillingFromOpenAICompletion(opts: {
  orgId: string;
  feature: BillingFeature;
  completion: {
    model?: string | null;
    usage?: {
      prompt_tokens?: number | null;
      completion_tokens?: number | null;
      prompt_tokens_details?: {
        cached_tokens?: number | null;
      } | null;
    } | null;
  };
}) {
  const { orgId, feature, completion } = opts;
  await recordOrgBillingUsage({
    orgId,
    feature,
    usage: usageFromOpenAICompletion(completion),
  });
}
