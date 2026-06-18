import { prisma } from "@/lib/prisma";
import { ALL_VOICES, type Voice } from "@/lib/constants/voices";
type EngineVoiceRow = {
  id: string;
  name: string;
  provider: string;
  model: string;
  description: string | null;
  gender: string | null;
  tags: string[];
  isActive: boolean;
  isBuiltIn: boolean;
  createdAt: Date;
  updatedAt: Date;
};
function toVoice(row: EngineVoiceRow): Voice {
  const normalizedProvider = String(row.provider).toUpperCase();
  const provider: Voice["provider"] =
    normalizedProvider === "SARVAM"
      ? "SARVAM"
      : normalizedProvider === "ELEVENLABS"
        ? "ELEVENLABS"
        : "CARTESIA";
  const gender = String(row.gender || "").toLowerCase() === "male" ? "male" : "female";
  return {
    id: row.id,
    name: row.name,
    provider,
    model: row.model,
    gender,
    description: row.description || "",
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}
export async function listSelectableVoices(): Promise<Voice[]> {
  const rows = (await prisma.engineVoice.findMany()) as EngineVoiceRow[];
  const voiceMap = new Map<string, Voice>(ALL_VOICES.map((voice) => [voice.id, voice]));
  for (const row of rows) {
    if (row.isBuiltIn) {
      if (!row.isActive) {
        voiceMap.delete(row.id);
      } else {
        voiceMap.set(row.id, toVoice(row));
      }
      continue;
    }
    if (row.isActive) {
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
