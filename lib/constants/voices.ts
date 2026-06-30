// Canonical voice/model data lives in ai-models-config.ts — this file re-exports for backward compat.
export { ALL_VOICES, getVoiceById } from "@/lib/ai-models-config";

export type Voice = {
  id: string;
  name: string;
  provider: "CARTESIA" | "SARVAM" | "ELEVENLABS";
  model: string;
  description: string;
  gender: "male" | "female";
  tags?: string[];
};

export const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

import { ALL_VOICES as _ALL } from "@/lib/ai-models-config";
export function getProviderForVoice(id: string): "CARTESIA" | "SARVAM" | "ELEVENLABS" {
  return _ALL.find(v => v.id === id)?.provider ?? "ELEVENLABS";
}
