// Canonical voice/model data lives in ai-models-config.ts -- this file re-exports for backward compat.
export { ALL_VOICES, getVoiceById } from "@/lib/ai-models-config";

export type Voice = {
  id: string;
  name: string;
  provider: "SARVAM" | "ELEVENLABS";
  model: string;
  description: string;
  gender: "male" | "female";
  tags?: string[];
};

import { ALL_VOICES as _ALL } from "@/lib/ai-models-config";
export function getProviderForVoice(id: string): "SARVAM" | "ELEVENLABS" {
  return _ALL.find(v => v.id === id)?.provider ?? "ELEVENLABS";
}
