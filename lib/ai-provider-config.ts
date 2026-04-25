export const DEFAULT_CARTESIA_MODEL = "cartesia/sonic-3";
export const DEFAULT_CARTESIA_VOICE_ID = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc";
export const DEFAULT_SARVAM_MODEL = "bulbul:v3";
export const DEFAULT_SARVAM_VOICE = "shubh";
export const DEFAULT_GOOGLE_TTS_MODEL = "gemini-3.1-flash-tts-preview";
export const DEFAULT_GOOGLE_VOICE_NAME = "Puck";
export const DEFAULT_DEEPGRAM_MODEL = "nova-3-general";
export const DEFAULT_SARVAM_STT_MODEL = "saaras:v3";
export const DEFAULT_LLM_PROVIDER = "OPENAI";
export const DEFAULT_LLM_MODEL = "gpt-4o";
export const DEFAULT_LLM_TEMPERATURE = 0.7;

type AiProviderConfig = {
  ttsProvider?: string | null;
  cartesiaModel?: string | null;
  cartesiaVoiceId?: string | null;
  sarvamModel?: string | null;
  sarvamVoice?: string | null;
  googleModel?: string | null;
  googleVoiceName?: string | null;
  sttProvider?: string | null;
  deepgramModel?: string | null;
  sarvamSttModel?: string | null;
  llmProvider?: string | null;
  llmModel?: string | null;
  llmTemperature?: number | string | null;
};

type NormalizeOptions = {
  current?: Partial<AiProviderConfig> | null;
  next?: Partial<AiProviderConfig> | null;
};

function resolveString(
  nextValue: string | null | undefined,
  currentValue: string | null | undefined,
  fallback: string
): string {
  const candidate = nextValue ?? currentValue ?? fallback;
  return String(candidate ?? fallback).trim() || fallback;
}

function resolveNumber(
  nextValue: number | string | null | undefined,
  currentValue: number | string | null | undefined,
  fallback: number
): number {
  const candidate = nextValue ?? currentValue ?? fallback;
  const parsed = typeof candidate === "number" ? candidate : Number(candidate);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveProvider(
  nextValue: string | null | undefined,
  currentValue: string | null | undefined,
  fallback: string
): string {
  return resolveString(nextValue, currentValue, fallback).toUpperCase();
}

export function normalizeDriveAiConfig({
  current = {},
  next = {},
}: NormalizeOptions): Record<string, string | number | null> {
  const currentConfig = current ?? {};
  const nextConfig = next ?? {};
  const provider = resolveProvider(nextConfig.ttsProvider, currentConfig.ttsProvider, "CARTESIA");
  const normalized: Record<string, string | number | null> = {
    ttsProvider: provider,
  };

  if (provider === "GOOGLE") {
    normalized.googleModel = resolveString(
      nextConfig.googleModel,
      currentConfig.googleModel,
      DEFAULT_GOOGLE_TTS_MODEL
    );
    normalized.googleVoiceName = resolveString(
      nextConfig.googleVoiceName,
      currentConfig.googleVoiceName,
      DEFAULT_GOOGLE_VOICE_NAME
    );
    normalized.cartesiaVoiceId = null;
    normalized.sarvamModel = null;
    normalized.sarvamVoice = null;
    return normalized;
  }

  if (provider === "SARVAM") {
    normalized.sarvamModel = resolveString(
      nextConfig.sarvamModel,
      currentConfig.sarvamModel,
      DEFAULT_SARVAM_MODEL
    );
    normalized.sarvamVoice = resolveString(
      nextConfig.sarvamVoice,
      currentConfig.sarvamVoice,
      DEFAULT_SARVAM_VOICE
    );
    normalized.cartesiaVoiceId = null;
    normalized.googleModel = null;
    normalized.googleVoiceName = null;
    return normalized;
  }

  normalized.cartesiaVoiceId = resolveString(
    nextConfig.cartesiaVoiceId,
    currentConfig.cartesiaVoiceId,
    DEFAULT_CARTESIA_VOICE_ID
  );
  normalized.sarvamModel = null;
  normalized.sarvamVoice = null;
  normalized.googleModel = null;
  normalized.googleVoiceName = null;
  return normalized;
}

export function normalizeOrgAiConfig({
  current = {},
  next = {},
}: NormalizeOptions): Record<string, string | number | null> {
  const currentConfig = current ?? {};
  const nextConfig = next ?? {};
  const normalized = normalizeDriveAiConfig({ current: currentConfig, next: nextConfig });
  const provider = String(normalized.ttsProvider || "CARTESIA").toUpperCase();

  if (provider === "GOOGLE") {
    normalized.cartesiaModel = null;
    normalized.sttProvider = null;
    normalized.deepgramModel = null;
    normalized.sarvamSttModel = null;
    normalized.llmProvider = null;
    normalized.llmModel = null;
    normalized.llmTemperature = null;
    return normalized;
  }

  const sttProvider = resolveProvider(nextConfig.sttProvider, currentConfig.sttProvider, "DEEPGRAM");
  normalized.sttProvider = sttProvider;
  if (sttProvider === "SARVAM") {
    normalized.sarvamSttModel = resolveString(
      nextConfig.sarvamSttModel,
      currentConfig.sarvamSttModel,
      DEFAULT_SARVAM_STT_MODEL
    );
    normalized.deepgramModel = null;
  } else {
    normalized.deepgramModel = resolveString(
      nextConfig.deepgramModel,
      currentConfig.deepgramModel,
      DEFAULT_DEEPGRAM_MODEL
    );
    normalized.sarvamSttModel = null;
  }

  const llmProvider = resolveProvider(nextConfig.llmProvider, currentConfig.llmProvider, DEFAULT_LLM_PROVIDER);
  normalized.llmProvider = llmProvider;
  normalized.llmModel = resolveString(
    nextConfig.llmModel,
    currentConfig.llmModel,
    llmProvider === "SARVAM" ? "sarvam-30b" : DEFAULT_LLM_MODEL
  );
  normalized.llmTemperature = resolveNumber(
    nextConfig.llmTemperature,
    currentConfig.llmTemperature,
    DEFAULT_LLM_TEMPERATURE
  );
  normalized.cartesiaModel = resolveString(
    nextConfig.cartesiaModel,
    currentConfig.cartesiaModel,
    DEFAULT_CARTESIA_MODEL
  );

  return normalized;
}
