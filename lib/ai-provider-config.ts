import { DEFAULT_VOICE_ID, getVoiceById } from "@/lib/constants/voices";

export const DEFAULT_DEEPGRAM_MODEL = "nova-3-general";
export const DEFAULT_LLM_MODEL = "gpt-4.1-mini";
export const DEFAULT_LLM_TEMPERATURE = 0.7;

export function resolveVoiceConfig(voiceId: string | null | undefined): {
  voiceId: string;
  provider: "CARTESIA" | "SARVAM" | "ELEVENLABS";
  model: string;
} {
  const id = String(voiceId || DEFAULT_VOICE_ID).trim() || DEFAULT_VOICE_ID;
  const voice = getVoiceById(id);
  if (!voice) {
    const fallback = getVoiceById(DEFAULT_VOICE_ID)!;
    // Keep custom/unlisted voice IDs stable while preserving a safe fallback provider/model.
    return { voiceId: id, provider: fallback.provider, model: fallback.model };
  }
  return { voiceId: voice.id, provider: voice.provider, model: voice.model };
}

type DriveAiInput = {
  voiceId?: string | null;
};

type OrgAiInput = {
  voiceId?: string | null;
  allowedVoices?: string[] | null;
  deepgramModel?: string | null;
  llmModel?: string | null;
  llmTemperature?: number | string | null;
};

export function normalizeDriveAiConfig({
  current = {},
  next = {},
}: {
  current?: Partial<DriveAiInput> | null;
  next?: Partial<DriveAiInput> | null;
}): Record<string, string | null> {
  const id = next?.voiceId ?? current?.voiceId ?? DEFAULT_VOICE_ID;
  const { voiceId } = resolveVoiceConfig(id);
  return { voiceId };
}

export function normalizeOrgAiConfig({
  current = {},
  next = {},
}: {
  current?: Partial<OrgAiInput> | null;
  next?: Partial<OrgAiInput> | null;
}): Record<string, string | number | string[] | null> {
  const driveFields = normalizeDriveAiConfig({ current, next });

  const rawTemp = next?.llmTemperature ?? current?.llmTemperature ?? DEFAULT_LLM_TEMPERATURE;
  const temp = typeof rawTemp === "number" ? rawTemp : Number(rawTemp);
  const llmTemperature = Number.isFinite(temp) ? temp : DEFAULT_LLM_TEMPERATURE;

  const llmModel = String(next?.llmModel ?? current?.llmModel ?? DEFAULT_LLM_MODEL).trim() || DEFAULT_LLM_MODEL;

  const allowedVoices: string[] = (() => {
    const raw = next?.allowedVoices ?? current?.allowedVoices;
    if (!Array.isArray(raw)) return [];
    return Array.from(new Set(raw.map((id) => String(id || "").trim()).filter(Boolean)));
  })();

  const deepgramModel = String(next?.deepgramModel ?? current?.deepgramModel ?? DEFAULT_DEEPGRAM_MODEL).trim() || DEFAULT_DEEPGRAM_MODEL;

  return {
    ...driveFields,
    deepgramModel,
    llmModel,
    llmTemperature,
    allowedVoices,
  };
}
