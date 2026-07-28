import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

type ElevenLabsCatalogVoice = {
  id: string;
  name: string;
  description: string | null;
  gender: "male" | "female" | null;
  previewUrl: string | null;
  category: string | null;
};

function normalizeGender(value: unknown): "male" | "female" | null {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "male" || raw === "masculine") return "male";
  if (raw === "female" || raw === "feminine") return "female";
  return null;
}

// GET /api/super-admin/voices/elevenlabs-catalog
// Lists the full ElevenLabs voice library reachable with this account's API key
// (premade + cloned/shared voices) so super admins can browse and pick voices
// instead of needing to already know a voice ID.
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY is missing" }, { status: 500 });
    }

    const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      let reason = response.statusText || "Unable to fetch voices from ElevenLabs";
      try {
        const data = await response.json();
        reason = data?.detail?.message || data?.message || reason;
      } catch {
        // keep status text fallback
      }
      return NextResponse.json({ error: `ElevenLabs voice catalog fetch failed: ${reason}` }, { status: 502 });
    }

    const payload = await response.json();
    const rawVoices: unknown[] = Array.isArray(payload?.voices) ? payload.voices : [];

    const voices: ElevenLabsCatalogVoice[] = rawVoices
      .map((v: any) => ({
        id: String(v?.voice_id || "").trim(),
        name: String(v?.name || "").trim() || String(v?.voice_id || ""),
        description: v?.description ? String(v.description) : null,
        gender: normalizeGender(v?.labels?.gender),
        previewUrl: v?.preview_url ? String(v.preview_url) : null,
        category: v?.category ? String(v.category) : null,
      }))
      .filter((v) => v.id);

    return NextResponse.json({ voices });
  } catch (error) {
    return apiErrorResponse({
      route: "/api/super-admin/voices/elevenlabs-catalog",
      method: "GET",
      error,
      body: { error: "Failed to load ElevenLabs voice catalog" },
      status: 500,
      logLabel: "ElevenLabs voice catalog error:",
    });
  }
}
