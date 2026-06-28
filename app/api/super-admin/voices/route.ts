import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALL_VOICES } from "@/lib/constants/voices";
import { listSelectableVoices } from "@/lib/engine-voices";
function asProvider(value: unknown): "CARTESIA" | "SARVAM" | "ELEVENLABS" | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "CARTESIA" || normalized === "SARVAM" || normalized === "ELEVENLABS") return normalized;
  return null;
}
function defaultModelForProvider(provider: "CARTESIA" | "SARVAM" | "ELEVENLABS") {
  if (provider === "ELEVENLABS") return "eleven_flash_v2_5";
  return provider === "SARVAM" ? "bulbul:v3" : "cartesia/sonic-3";
}
function normalizeGender(value: unknown): "male" | "female" | null {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "male" || raw === "masculine") return "male";
  if (raw === "female" || raw === "feminine") return "female";
  return null;
}
async function fetchCartesiaVoiceMetadata(id: string): Promise<{
  name: string;
  description: string | null;
  gender: "male" | "female" | null;
}> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    throw new Error("CARTESIA_API_KEY is missing");
  }
  const response = await fetch(`https://api.cartesia.ai/voices/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": "2024-06-10",
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    if (response.status === 404) {
      // Fallback: some accounts only resolve voice IDs from the catalog list.
      const listResponse = await fetch("https://api.cartesia.ai/voices", {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          "Cartesia-Version": "2024-06-10",
          "Content-Type": "application/json",
        },
      });
      if (listResponse.ok) {
        const listPayload = await listResponse.json();
        const voices = Array.isArray(listPayload) ? listPayload : listPayload?.voices;
        if (Array.isArray(voices)) {
          const matched = voices.find((voice: unknown) => {
            const item = voice as { id?: unknown };
            return String(item?.id || "") === id;
          }) as { name?: unknown; description?: unknown; gender?: unknown } | undefined;
          if (matched) {
            return {
              name: String(matched?.name || "").trim() || id,
              description: matched?.description ? String(matched.description) : null,
              gender: normalizeGender(matched?.gender),
            };
          }
        }
      }
      throw new Error("Please check your voice ID and try again.");
    }
    let reason = response.statusText || "Unable to fetch voice from Cartesia";
    try {
      const data = await response.json();
      reason = data?.message || data?.error?.message || reason;
    } catch {
      // keep status text fallback
    }
    throw new Error(`Cartesia voice lookup failed: ${reason}`);
  }
  const payload = await response.json();
  const name = String(payload?.name || "").trim() || id;
  const description = payload?.description ? String(payload.description) : null;
  const gender = normalizeGender(payload?.gender);
  return { name, description, gender };
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
    const rows = await prisma.engineVoice.findMany({ orderBy: [{ provider: "asc" }, { name: "asc" }] });
    return NextResponse.json({
      selectableVoices,
      customVoices: rows.map((row) => ({
        id: row.id,
        name: row.name,
        provider: row.provider,
        model: row.model,
        description: row.description,
        gender: row.gender,
        tags: row.tags,
        isBuiltIn: row.isBuiltIn,
        isActive: row.isActive,
        isSelectable: selectableIds.has(row.id),
      })),
      builtInVoices: ALL_VOICES.map((voice) => ({ ...voice, isSelectable: selectableIds.has(voice.id) })),
    });
  } catch (error) {
    console.error("Voice admin list error:", error);
    return NextResponse.json({ error: "Failed to load voice registry" }, { status: 500 });
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
      await prisma.engineVoice.deleteMany({ where: { id } });
      return NextResponse.json({ success: true });
    }
    if (action === "remove") {
      if (builtIn) {
        await prisma.engineVoice.upsert({
          where: { id },
          update: { isActive: false, isBuiltIn: true },
          create: {
            id,
            name: builtIn.name,
            provider: builtIn.provider,
            model: builtIn.model,
            description: builtIn.description,
            gender: builtIn.gender,
            tags: builtIn.tags || [],
            isBuiltIn: true,
            isActive: false,
          },
        });
      } else {
        await prisma.engineVoice.upsert({
          where: { id },
          update: { isActive: false },
          create: {
            id,
            name: id,
            provider: provider || "CARTESIA",
            model: defaultModelForProvider(provider || "CARTESIA"),
            description: null,
            gender: null,
            tags: [],
            isBuiltIn: false,
            isActive: false,
          },
        });
      }
      return NextResponse.json({ success: true });
    }
    if (builtIn) {
      await prisma.engineVoice.upsert({
        where: { id },
        update: { isActive: true, isBuiltIn: true },
        create: {
          id,
          name: builtIn.name,
          provider: builtIn.provider,
          model: builtIn.model,
          description: builtIn.description,
          gender: builtIn.gender,
          tags: builtIn.tags || [],
          isBuiltIn: true,
          isActive: true,
        },
      });
      return NextResponse.json({ success: true });
    }
    if (!provider) {
      return NextResponse.json({ error: "provider must be CARTESIA, SARVAM, or ELEVENLABS for custom voices" }, { status: 400 });
    }
    let name = id;
    let description: string | null = null;
    let gender: "male" | "female" | null = null;
    if (provider === "CARTESIA") {
      const metadata = await fetchCartesiaVoiceMetadata(id);
      name = metadata.name;
      description = metadata.description;
      gender = metadata.gender;
    } else if (provider === "ELEVENLABS") {
      const metadata = await fetchElevenLabsVoiceMetadata(id);
      name = metadata.name;
      description = metadata.description;
      gender = metadata.gender;
    }
    await prisma.engineVoice.upsert({
      where: { id },
      update: {
        name,
        provider,
        model: defaultModelForProvider(provider),
        description,
        gender,
        tags: [],
        isBuiltIn: false,
        isActive: true,
      },
      create: {
        id,
        name,
        provider,
        model: defaultModelForProvider(provider),
        description,
        gender,
        tags: [],
        isBuiltIn: false,
        isActive: true,
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
