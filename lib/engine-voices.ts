import { prisma } from "@/lib/prisma";
import { ALL_VOICES, type Voice } from "@/lib/constants/voices";
type AIVoiceRow = {
  id: string;
  voiceName: string;
  voiceProvider: string;
  voiceModel: string;
  voiceDescription: string | null;
  voiceGender: string | null;
  voiceTags: string[];
  isAvailable: boolean;
  isSystemDefault: boolean;
  voiceCreatedAt: Date;
  voiceUpdatedAt: Date;
};
function toVoice(row: AIVoiceRow): Voice {
  const normalizedProvider = String(row.voiceProvider).toUpperCase();
  // Cartesia removed: any stale/unknown provider normalizes to ElevenLabs.
  const provider: Voice["provider"] =
    normalizedProvider === "SARVAM" ? "SARVAM" : "ELEVENLABS";
  const gender = String(row.voiceGender || "").toLowerCase() === "male" ? "male" : "female";
  return {
    id: row.id,
    name: row.voiceName,
    provider,
    model: row.voiceModel,
    gender,
    description: row.voiceDescription || "",
    tags: Array.isArray(row.voiceTags) ? row.voiceTags : [],
  };
}
export async function listSelectableVoices(): Promise<Voice[]> {
  const rows = (await prisma.aIVoice.findMany()) as AIVoiceRow[];
  const voiceMap = new Map<string, Voice>(ALL_VOICES.map((voice) => [voice.id, voice]));
  for (const row of rows) {
    if (row.isSystemDefault) {
      if (!row.isAvailable) {
        voiceMap.delete(row.id);
      } else {
        voiceMap.set(row.id, toVoice(row));
      }
      continue;
    }
    if (row.isAvailable) {
      voiceMap.set(row.id, toVoice(row));
    } else {
      voiceMap.delete(row.id);
    }
  }
  return Array.from(voiceMap.values()).sort((a, b) =>
    `${a.provider}-${a.name}`.localeCompare(`${b.provider}-${b.name}`)
  );
}
export async function getSelectableVoiceById(id: string): Promise<Voice | null> {
  const voices = await listSelectableVoices();
  return voices.find((voice) => voice.id === id) || null;
}
