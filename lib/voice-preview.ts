import { NextResponse } from "next/server";
import { CARTESIA_VOICES, SARVAM_VOICES } from "@/lib/constants/voices";

type VoiceProvider = "CARTESIA" | "SARVAM";

type VoicePreviewInput = {
  provider?: string;
  voiceId: string;
  transcript?: string;
  modelId?: string;
};

function normalizeProvider(provider?: string): VoiceProvider | null {
  const normalized = (provider || "").trim().toUpperCase();
  if (normalized === "CARTESIA" || normalized === "SARVAM") {
    return normalized;
  }
  return null;
}

function inferProviderFromVoiceId(voiceId: string): VoiceProvider {
  if (SARVAM_VOICES.some(v => v.id === voiceId)) {
    return "SARVAM";
  }
  if (CARTESIA_VOICES.some(v => v.id === voiceId)) {
    return "CARTESIA";
  }
  return "CARTESIA";
}

function toAudioResponse(audioBuffer: ArrayBuffer, contentType: string) {
  return new NextResponse(audioBuffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": audioBuffer.byteLength.toString(),
    },
  });
}

function decodeBase64Audio(rawAudio: unknown): Uint8Array | null {
  if (typeof rawAudio !== "string" || !rawAudio.trim()) {
    return null;
  }

  const base64 = rawAudio.includes(",") ? rawAudio.split(",").pop() || "" : rawAudio;
  if (!base64.trim()) {
    return null;
  }

  return Buffer.from(base64, "base64");
}

export async function createVoicePreviewResponse(input: VoicePreviewInput) {
  const { voiceId, transcript, modelId } = input;

  if (!voiceId) {
    return NextResponse.json({ error: "Voice ID is required" }, { status: 400 });
  }

  const provider = normalizeProvider(input.provider) || inferProviderFromVoiceId(voiceId);

  if (provider === "SARVAM") {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      console.error("[VoicePreview] SARVAM_API_KEY missing");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const model = modelId || "bulbul:v3";
    const isHindi = /[\u0900-\u097F]/.test(transcript || "");
    const langCode = isHindi ? "hi-IN" : "en-IN";
    const payload = {
      text: transcript || "Namaste, I am ready for the interview.",
      target_language_code: langCode,
      speaker: voiceId,
      pace: 1.0,
      speech_sample_rate: 22050,
      model,
      ...(model.includes("v2")
        ? { enable_preprocessing: true }
        : { temperature: 0.6 }),
    };

    const response = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMsg = response.statusText;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error?.message || errorData.message || errorMsg;
      } catch {
        const text = await response.text();
        if (text) errorMsg = text;
      }
      console.error(`[VoicePreview] Sarvam API error for Voice ID ${voiceId}:`, errorMsg);
      return NextResponse.json({ error: `Sarvam AI: ${errorMsg}` }, { status: response.status });
    }

    const data = await response.json();
    const audio = decodeBase64Audio(data.audios?.[0]);
    if (!audio) {
      return NextResponse.json({ error: "Invalid audio response from Sarvam AI" }, { status: 500 });
    }

    const audioBuffer = Uint8Array.from(audio).buffer;
    return toAudioResponse(audioBuffer, "audio/wav");
  }

  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    console.error("[VoicePreview] CARTESIA_API_KEY missing");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const normalizeModel = (value: string) => value.replace(/^cartesia\//, "");
  const defaultModel = voiceId === "95d51f79-c397-46f9-b49a-23763d3eaa2d"
    ? "sonic-3"
    : normalizeModel(modelId || "cartesia/sonic-3");

  const payload = {
    model_id: defaultModel,
    transcript: transcript || "Hello, I am ready to be your AI interviewer.",
    voice: {
      mode: "id",
      id: voiceId,
    },
    output_format: {
      container: "mp3",
      sample_rate: 44100,
      bit_rate: 128000,
    },
  };

  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": "2024-06-10",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMsg = response.statusText;
    try {
      const errorData = await response.json();
      errorMsg = errorData.error?.message || errorData.message || errorMsg;
    } catch {
      const text = await response.text();
      if (text) errorMsg = text;
    }
    console.error(`[VoicePreview] Cartesia API error for Voice ID ${voiceId}:`, errorMsg);
    return NextResponse.json({ error: `Cartesia: ${errorMsg}` }, { status: response.status });
  }

  const audioBuffer = await response.arrayBuffer();
  return toAudioResponse(audioBuffer, "audio/mpeg");
}
