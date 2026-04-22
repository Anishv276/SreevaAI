import { NextRequest } from "next/server";
import { createVoicePreviewResponse } from "@/lib/voice-preview";

export async function POST(req: NextRequest) {
  try {
    const { voiceId, transcript, modelId } = await req.json();
    return await createVoicePreviewResponse({ provider: "SARVAM", voiceId, transcript, modelId });
  } catch (err) {
    console.error("[SarvamVoicePreview] Internal error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
