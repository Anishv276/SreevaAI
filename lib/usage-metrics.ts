import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
export type BillingFeature =
  | "interview"
  | "resumeExtraction"
  | "jdExtraction"
  | "chatbot"
  | "resumeReport"
  | "interviewReport";
const BILLING_FEATURES: BillingFeature[] = [
  "interview",
  "resumeExtraction",
  "jdExtraction",
  "chatbot",
  "resumeReport",
  "interviewReport",
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
  provider?: string;
  model?: string;
  characters: number;
  costUsd: number;
};
type SttModelMetrics = {
  runs: number;
  provider?: string;
  model?: string;
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
  lastModel?: string;
  ttsByModel: Record<string, TtsModelMetrics>;
  sttByModel: Record<string, SttModelMetrics>;
};
const MODEL_RATES: Record<string, ModelCostRate> = {
  "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
  "gpt-5.5-pro": { input: 30, cachedInput: 30, output: 180 },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
  "gpt-5.4-pro": { input: 30, cachedInput: 30, output: 180 },
  "gpt-5.2": { input: 1.75, cachedInput: 0.175, output: 14 },
  "gpt-5.2-pro": { input: 21, cachedInput: 21, output: 168 },
  "gpt-5.1": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-5-pro": { input: 15, cachedInput: 15, output: 120 },
  "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "o4-mini": { input: 1.1, cachedInput: 0.275, output: 4.4 },
  "o3": { input: 2, cachedInput: 0.5, output: 8 },
  "o3-mini": { input: 1.1, cachedInput: 0.55, output: 4.4 },
  "o3-pro": { input: 20, cachedInput: 20, output: 80 },
  "o1": { input: 15, cachedInput: 7.5, output: 60 },
  "o1-mini": { input: 1.1, cachedInput: 0.55, output: 4.4 },
  "o1-pro": { input: 150, cachedInput: 150, output: 600 },
  "gpt-4o-2024-05-13": { input: 5, cachedInput: 5, output: 15 },
  "gpt-4-turbo-2024-04-09": { input: 10, cachedInput: 10, output: 30 },
  "gpt-4-0125-preview": { input: 10, cachedInput: 10, output: 30 },
  "gpt-4-1106-preview": { input: 10, cachedInput: 10, output: 30 },
  "gpt-4-1106-vision-preview": { input: 10, cachedInput: 10, output: 30 },
  "gpt-4-0613": { input: 30, cachedInput: 30, output: 60 },
  "gpt-4-0314": { input: 30, cachedInput: 30, output: 60 },
  "gpt-4-32k": { input: 60, cachedInput: 60, output: 120 },
  "gpt-3.5-turbo": { input: 0.5, cachedInput: 0.5, output: 1.5 },
  "gpt-3.5-turbo-0125": { input: 0.5, cachedInput: 0.5, output: 1.5 },
  "gpt-3.5-turbo-1106": { input: 1, cachedInput: 1, output: 2 },
  "gpt-3.5-turbo-0613": { input: 1.5, cachedInput: 1.5, output: 2 },
  "gpt-3.5-0301": { input: 1.5, cachedInput: 1.5, output: 2 },
  "gpt-3.5-turbo-instruct": { input: 1.5, cachedInput: 1.5, output: 2 },
  "gpt-3.5-turbo-16k-0613": { input: 3, cachedInput: 3, output: 4 },
  "davinci-002": { input: 2, cachedInput: 2, output: 2 },
  "babbage-002": { input: 0.4, cachedInput: 0.4, output: 0.4 },
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
  lastModel: undefined as string | undefined,
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
});
function normalizeModelName(model: string | undefined | null) {
  // Strip trailing date suffix e.g. "gpt-4.1-mini-2025-04-14" → "gpt-4.1-mini"
  return (model || "").trim().toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, "");
}
function getRate(model: string | undefined | null): ModelCostRate {
  const key = normalizeModelName(model);
  const rate = MODEL_RATES[key];
  if (!key || !rate) {
    throw new Error(`[usage-metrics] Missing pricing for OpenAI model "${model || ""}"`);
  }
  return rate;
}
export function calculateOpenAICost(opts: {
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
    model: completion.model ?? null,
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    cachedInputTokens: cachedTokens,
  };
}
function hasBillableUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costUsd?: number;
  ttsCharacters?: number;
  ttsCostUsd?: number;
  sttAudioSeconds?: number;
  sttCostUsd?: number;
  sessionDuration?: number;
}) {
  return (
    Number(usage.inputTokens || 0) > 0 ||
    Number(usage.outputTokens || 0) > 0 ||
    Number(usage.cachedInputTokens || 0) > 0 ||
    Number(usage.costUsd || 0) > 0 ||
    Number(usage.ttsCharacters || 0) > 0 ||
    Number(usage.ttsCostUsd || 0) > 0 ||
    Number(usage.sttAudioSeconds || 0) > 0 ||
    Number(usage.sttCostUsd || 0) > 0 ||
    Number(usage.sessionDuration || 0) > 0
  );
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
    costUsd?: number;
    ttsRuns?: number;
    ttsCharacters?: number;
  ttsCostUsd?: number;
  ttsProvider?: string | null;
  ttsModel?: string | null;
  sttRuns?: number;
  sttAudioSeconds?: number;
  sttCostUsd?: number;
  sttProvider?: string | null;
  sttModel?: string | null;
  eventId?: string | null;
  recordedAt?: string | null;
  },
) {
  const bucket = billing[feature];
  const modelKey = normalizeModelName(usage.model);
  const hasProvidedCost = typeof usage.costUsd === "number" && Number.isFinite(usage.costUsd);
  const hasTokenUsage =
    (usage.inputTokens ?? 0) > 0 ||
    (usage.outputTokens ?? 0) > 0 ||
    (usage.cachedInputTokens ?? 0) > 0;
  const costUsd = hasProvidedCost ? Number(usage.costUsd) : (hasTokenUsage ? calculateOpenAICost(usage) : 0);
  const hasLlmUsage =
    hasTokenUsage ||
    costUsd > 0;
  if (hasLlmUsage && !modelKey) {
    throw new Error(`[usage-metrics] Missing OpenAI model for org billing feature=${feature}`);
  }
  if (hasLlmUsage) {
    bucket.runs += 1;
    bucket.inputTokens += usage.inputTokens ?? 0;
    bucket.cachedInputTokens += usage.cachedInputTokens ?? 0;
    bucket.outputTokens += usage.outputTokens ?? 0;
    bucket.costUsd += costUsd;
  }
  bucket.sessionDuration += usage.sessionDuration ?? 0;
  bucket.ttsRuns += usage.ttsRuns ?? 0;
  bucket.ttsCharacters += usage.ttsCharacters ?? 0;
  bucket.ttsCostUsd += usage.ttsCostUsd ?? 0;
  bucket.sttRuns += usage.sttRuns ?? 0;
  bucket.sttAudioSeconds += usage.sttAudioSeconds ?? 0;
  bucket.sttCostUsd += usage.sttCostUsd ?? 0;
  if ((usage.ttsRuns ?? 0) > 0 || (usage.ttsCharacters ?? 0) > 0 || (usage.ttsCostUsd ?? 0) > 0) {
    const provider = String(usage.ttsProvider || "").trim().toUpperCase();
    const model = String(usage.ttsModel || "").trim();
    if (!provider || !model) {
      throw new Error(`[usage-metrics] Missing TTS provider/model for org billing feature=${feature}`);
    }
    const key = `${provider.toLowerCase()}:${model.toLowerCase()}`;
    if (!bucket.ttsByModel[key]) {
      bucket.ttsByModel[key] = { runs: 0, provider, model, characters: 0, costUsd: 0 };
    }
    const ttsBucket = bucket.ttsByModel[key]!;
    ttsBucket.runs += usage.ttsRuns ?? 0;
    ttsBucket.characters += usage.ttsCharacters ?? 0;
    ttsBucket.costUsd += usage.ttsCostUsd ?? 0;
  }
  if ((usage.sttRuns ?? 0) > 0 || (usage.sttAudioSeconds ?? 0) > 0 || (usage.sttCostUsd ?? 0) > 0) {
    const provider = String(usage.sttProvider || "").trim().toUpperCase();
    const model = String(usage.sttModel || "").trim();
    if (!provider || !model) {
      throw new Error(`[usage-metrics] Missing STT provider/model for org billing feature=${feature}`);
    }
    const key = `${provider.toLowerCase()}:${model.toLowerCase()}`;
    if (!bucket.sttByModel[key]) {
      bucket.sttByModel[key] = { runs: 0, provider, model, audioSeconds: 0, costUsd: 0 };
    }
    const sttBucket = bucket.sttByModel[key]!;
    sttBucket.runs += usage.sttRuns ?? 0;
    sttBucket.audioSeconds += usage.sttAudioSeconds ?? 0;
    sttBucket.costUsd += usage.sttCostUsd ?? 0;
  }
  if (hasLlmUsage) {
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
    // Always update lastModel so we know the most recently used model
    bucket.lastModel = modelKey;
  }
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
    if (src.lastModel) dst.lastModel = src.lastModel as string;
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
    costUsd?: number;
    ttsRuns?: number;
    ttsCharacters?: number;
    ttsCostUsd?: number;
    ttsProvider?: string | null;
    ttsModel?: string | null;
    sttRuns?: number;
    sttAudioSeconds?: number;
    sttCostUsd?: number;
    sttProvider?: string | null;
    sttModel?: string | null;
    eventId?: string | null;
    recordedAt?: string | null;
  };
}) {
  const { orgId, feature, usage } = opts;
  if (!hasBillableUsage(usage)) {
    throw new Error(`[usage-metrics] Refusing to record empty billing usage for org=${orgId} feature=${feature}`);
  }
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ usageMetrics: unknown }>>(
      Prisma.sql`
        SELECT "usageMetrics"
        FROM "Organization"
        WHERE id = ${orgId}
        FOR UPDATE
      `
    );
    const org = rows[0];
    if (!org) return;
    const existingUsage =
      org.usageMetrics && typeof org.usageMetrics === "object"
        ? (org.usageMetrics as Record<string, unknown>)
        : {};
    const existingEvents = Array.isArray((existingUsage as any).recentBillingEvents)
      ? ((existingUsage as any).recentBillingEvents as Array<Record<string, unknown>>)
      : [];
    if (usage.eventId && existingEvents.some((event) => event?.id === usage.eventId)) {
      return;
    }
    const billing = coerceBillingMetrics(existingUsage.billing);
    mergeBillingFeature(billing, feature, usage);
    const recentEvents = [...existingEvents];
    if (usage.eventId) {
      recentEvents.unshift({
        id: usage.eventId,
        feature,
        model: usage.model ?? null,
        ttsModel: usage.ttsModel ?? null,
        sttModel: usage.sttModel ?? null,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cachedInputTokens: usage.cachedInputTokens ?? 0,
        costUsd: usage.costUsd ?? 0,
        ttsCharacters: usage.ttsCharacters ?? 0,
        ttsCostUsd: usage.ttsCostUsd ?? 0,
        sttAudioSeconds: usage.sttAudioSeconds ?? 0,
        sttCostUsd: usage.sttCostUsd ?? 0,
        recordedAt: usage.recordedAt ?? new Date().toISOString(),
      });
    }
    const updatedUsage: Record<string, unknown> = {
      ...existingUsage,
      billing,
      ...(recentEvents.length ? { recentBillingEvents: recentEvents.slice(0, 100) } : {}),
      updatedAt: new Date().toISOString(),
    };
    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "Organization"
        SET "usageMetrics" = ${JSON.stringify(updatedUsage)}::jsonb,
            "updatedAt" = NOW()
        WHERE id = ${orgId}
      `
    );
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
