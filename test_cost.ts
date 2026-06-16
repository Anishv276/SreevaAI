const MODEL_RATES: Record<string, any> = {
  "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
};

function normalizeModelName(model: string | undefined | null) {
  return (model || "").trim().toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

function getRate(model: string | undefined | null) {
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

console.log(calculateOpenAICost({
  model: "gpt-5.4-mini",
  inputTokens: 4301,
  outputTokens: 1109,
  cachedInputTokens: 0
}));
