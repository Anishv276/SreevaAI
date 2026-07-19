import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALL_VOICES } from "@/lib/constants/voices";
import { listSelectableVoices } from "@/lib/engine-voices";
import { apiErrorResponse } from "@/lib/slack-error-logger";
function asProvider(value: unknown): "SARVAM" | "ELEVENLABS" | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "SARVAM" || normalized === "ELEVENLABS") return normalized;
  return null;
}
function defaultModelForProvider(provider: "SARVAM" | "ELEVENLABS") {
  return provider === "SARVAM" ? "bulbul:v3" : "eleven_flash_v2_5";
}
function normalizeGender(value: unknown): "male" | "female" | null {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "male" || raw === "masculine") return "male";
  if (raw === "female" || raw === "feminine") return "female";
  return null;
}
async function fetchElevenLabsVoiceMetadata(id: string): Promise<{
  name: string;
  description: string | null;
  gender: "male" | "female" | null;
}> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is missing");
  }
  const response = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Please check your voice ID and try again.");
    }
    let reason = response.statusText || "Unable to fetch voice from ElevenLabs";
    try {
      const data = await response.json();
      reason = data?.detail?.message || data?.message || reason;
    } catch {
      // keep status text fallback
    }
    throw new Error(`ElevenLabs voice lookup failed: ${reason}`);
  }
  const payload = await response.json();
  const name = String(payload?.name || "").trim() || id;
  const description = payload?.description ? String(payload.description) : null;
  const gender = normalizeGender(payload?.labels?.gender);
  return { name, description, gender };
}
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }
    const selectableVoices = await listSelectableVoices();
    const selectableIds = new Set(selectableVoices.map((voice) => voice.id));
    const rows = await prisma.aIVoice.findMany({ orderBy: [{ voiceProvider: "asc" }, { voiceName: "asc" }] });
    return NextResponse.json({
      selectableVoices,
      customVoices: rows.map((row) => ({
        id: row.id,
        name: row.voiceName,
        provider: row.voiceProvider,
        model: row.voiceModel,
        description: row.voiceDescription,
        gender: row.voiceGender,
        tags: row.voiceTags,
        isBuiltIn: row.isSystemDefault,
        isActive: row.isAvailable,
        isSelectable: selectableIds.has(row.id),
      })),
      builtInVoices: ALL_VOICES.map((voice) => ({ ...voice, isSelectable: selectableIds.has(voice.id) })),
    });
  } catch (error) {
    return apiErrorResponse({
      route: "/api/super-admin/voices",
      method: "GET",
      error,
      body: { error: "Failed to load voice registry" },
      status: 500,
      logLabel: "Voice admin list error:",
    });
  }
}
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }
    const body = await request.json();
    const action = String(body?.action || "").trim().toLowerCase();
    const id = String(body?.id || "").trim();
    const provider = asProvider(body?.provider);
    if (!id) {
      return NextResponse.json({ error: "Voice ID is required" }, { status: 400 });
    }
    if (action !== "add" && action !== "remove" && action !== "delete") {
      return NextResponse.json({ error: "action must be add, remove, or delete" }, { status: 400 });
    }
    const builtIn = ALL_VOICES.find((voice) => voice.id === id);
    if (action === "delete") {
      if (builtIn) {
        return NextResponse.json(
          { error: "Built-in voices cannot be permanently deleted. Use remove instead." },
          { status: 400 }
        );
      }
      await prisma.aIVoice.updateMany({ where: { id }, data: { isDeleted: true, isAvailable: false } });
      return NextResponse.json({ success: true });
    }
    if (action === "remove") {
      if (builtIn) {
        await prisma.aIVoice.upsert({
          where: { id },
          update: { isAvailable: false, isSystemDefault: true },
          create: {
            id,
            voiceName: builtIn.name,
            voiceProvider: builtIn.provider,
            voiceModel: builtIn.model,
            voiceDescription: builtIn.description,
            voiceGender: builtIn.gender,
            voiceTags: builtIn.tags || [],
            isSystemDefault: true,
            isAvailable: false,
          },
        });
      } else {
        await prisma.aIVoice.upsert({
          where: { id },
          update: { isAvailable: false },
          create: {
            id,
            voiceName: id,
            voiceProvider: provider || "ELEVENLABS",
            voiceModel: defaultModelForProvider(provider || "ELEVENLABS"),
            voiceDescription: null,
            voiceGender: null,
            voiceTags: [],
            isSystemDefault: false,
            isAvailable: false,
          },
        });
      }
      return NextResponse.json({ success: true });
    }
    if (builtIn) {
      await prisma.aIVoice.upsert({
        where: { id },
        update: { isAvailable: true, isSystemDefault: true, isDeleted: false },
        create: {
          id,
          voiceName: builtIn.name,
          voiceProvider: builtIn.provider,
          voiceModel: builtIn.model,
          voiceDescription: builtIn.description,
          voiceGender: builtIn.gender,
          voiceTags: builtIn.tags || [],
          isSystemDefault: true,
          isAvailable: true,
        },
      });
      return NextResponse.json({ success: true });
    }
    if (!provider) {
      return NextResponse.json({ error: "provider must be SARVAM or ELEVENLABS for custom voices" }, { status: 400 });
    }
    let voiceName = id;
    let voiceDescription: string | null = null;
    let voiceGender: "male" | "female" | null = null;
    if (provider === "ELEVENLABS") {
      const metadata = await fetchElevenLabsVoiceMetadata(id);
      voiceName = metadata.name;
      voiceDescription = metadata.description;
      voiceGender = metadata.gender;
    }
    await prisma.aIVoice.upsert({
      where: { id },
      update: {
        voiceName,
        voiceProvider: provider,
        voiceModel: defaultModelForProvider(provider),
        voiceDescription,
        voiceGender,
        voiceTags: [],
        isSystemDefault: false,
        isAvailable: true,
        isDeleted: false,
      },
      create: {
        id,
        voiceName,
        voiceProvider: provider,
        voiceModel: defaultModelForProvider(provider),
        voiceDescription,
        voiceGender,
        voiceTags: [],
        isSystemDefault: false,
        isAvailable: true,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update voice registry";
    const isValidationError =
      message.includes("voice not found") ||
      message.includes("lookup failed") ||
      message.includes("Voice ID is required") ||
      message.includes("provider must be");
    if (isValidationError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Voice admin update error:", error);
    return NextResponse.json({ error: "Failed to update voice registry" }, { status: 500 });
  }
}
