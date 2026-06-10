import { NextResponse } from "next/server";
import { getSelectableVoiceById } from "@/lib/engine-voices";
import { recordOrgBillingUsage } from "@/lib/usage-metrics";

type VoicePreviewInput = {
  voiceId: string;
  transcript?: string;
  orgId?: string | null;
};

const BILLING_INR_PER_USD = Number(process.env.BILLING_INR_PER_USD || 83);
const SARVAM_TTS_INR_PER_10K: Record<string, number> = { "bulbul:v3": 30, "bulbul:v2": 15 };
const CARTESIA_TTS_USD_PER_M: Record<string, number> = {
  "sonic-3": 15,
  "sonic-2": 15,
  sonic: 15,
  "sonic-3-hd": 30,
  "sonic-2-hd": 30,
  "sonic-hd": 30,
};
const ELEVENLABS_TTS_USD_PER_M: Record<string, number> = {
  eleven_flash_v2: 50,
  eleven_flash_v2_5: 50,
  eleven_turbo_v2: 50,
  eleven_turbo_v2_5: 50,
  eleven_multilingual_v2: 100,
  eleven_multilingual_v3: 100,
};

function estimateTtsCostUsd(provider: string, model: string, characters: number) {
  const chars = Math.max(0, Math.round(Number(characters || 0)));
  if (chars <= 0) return 0;
  const normalizedProvider = provider.trim().toUpperCase();
  const normalizedModel = model.replace(/^(cartesia|elevenlabs)\//i, "").trim().toLowerCase();

  if (normalizedProvider === "SARVAM") {
    const rate = SARVAM_TTS_INR_PER_10K[normalizedModel] ?? SARVAM_TTS_INR_PER_10K["bulbul:v3"];
    return (chars / 10_000) * rate / Math.max(BILLING_INR_PER_USD, 1e-6);
  }
  if (normalizedProvider === "ELEVENLABS") {
    const rate = ELEVENLABS_TTS_USD_PER_M[normalizedModel] ?? Number(process.env.ELEVENLABS_TTS_USD_PER_MILLION_CHARS || 100);
    return (chars / 1_000_000) * rate;
  }
  const rate = CARTESIA_TTS_USD_PER_M[normalizedModel] ?? Number(process.env.CARTESIA_TTS_USD_PER_MILLION_CHARS || 15);
  return (chars / 1_000_000) * rate;
}

async function recordVoicePreviewUsage(input: {
  orgId?: string | null;
  provider: string;
  model: string;
  text: string;
}) {
  const orgId = input.orgId?.trim();
  if (!orgId) return;
  const characters = input.text.length;
  if (characters <= 0) return;
  try {
    await recordOrgBillingUsage({
      orgId,
      feature: "interview",
      usage: {
        ttsRuns: 1,
        ttsProvider: input.provider,
        ttsModel: input.model,
        ttsCharacters: characters,
        ttsCostUsd: estimateTtsCostUsd(input.provider, input.model, characters),
        eventId: `voice-preview:${orgId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      },
    });
  } catch (error) {
    console.error("[VoicePreview] Failed to record TTS usage:", error);
  }
}

function pcmToWav(pcmData: Uint8Array, sampleRate = 22050, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const buffer = Buffer.alloc(44 + pcmData.length);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcmData.length, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcmData.length, 40);
  Buffer.from(pcmData).copy(buffer, 44);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function toAudioResponse(audioBuffer: ArrayBuffer, contentType: string) {
  return new NextResponse(audioBuffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": audioBuffer.byteLength.toString(),
    },
  });
}

function logCreditRechargeNeeded(provider: string) {
  console.error(`[VoicePreview] ${provider} 402 - pls recharge credits`);
}

export async function createVoicePreviewResponse(input: VoicePreviewInput) {
  const { voiceId, transcript, orgId } = input;

  if (!voiceId) {
    return NextResponse.json({ error: "Voice ID is required" }, { status: 400 });
  }

  const voice = await getSelectableVoiceById(voiceId);
  if (!voice) {
    return NextResponse.json({ error: "Unknown voice ID" }, { status: 400 });
  }

  if (voice.provider === "SARVAM") {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      console.error("[VoicePreview] SARVAM_API_KEY missing");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const isHindi = /[ऀ-ॿ]/.test(transcript || "");
    const langCode = isHindi ? "hi-IN" : "en-IN";
    const model = voice.model;
    const text = transcript || "Namaste, I am ready for the interview.";
    const payload = {
      text,
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
      headers: { "api-subscription-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMsg = response.statusText;
      try {
        const text = await response.text();
        if (text) {
          try {
            const errorData = JSON.parse(text);
            errorMsg = errorData.error?.message || errorData.message || errorMsg;
          } catch {
            errorMsg = text;
          }
        }
      } catch { /* keep statusText */ }
      if (response.status === 402) {
        logCreditRechargeNeeded("Sarvam");
      }
      return NextResponse.json({ error: `Sarvam AI: ${errorMsg}` }, { status: response.status });
    }

    const data = await response.json();
    const rawAudio = data.audios?.[0];
    if (typeof rawAudio !== "string" || !rawAudio.trim()) {
      return NextResponse.json({ error: "Invalid audio response from Sarvam AI" }, { status: 500 });
    }
    const base64 = rawAudio.includes(",") ? rawAudio.split(",").pop() || "" : rawAudio;
    const audio = Buffer.from(base64, "base64");
    await recordVoicePreviewUsage({ orgId, provider: voice.provider, model, text });
    return toAudioResponse(pcmToWav(audio), "audio/wav");
  }

  if (voice.provider === "ELEVENLABS") {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.error("[VoicePreview] ELEVENLABS_API_KEY missing");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const text = transcript || "Hello, I am ready to be your AI interviewer.";
    const payload = {
      text,
      model_id: voice.model || "eleven_turbo_v2_5",
    };

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMsg = response.statusText;
      try {
        const text = await response.text();
        if (text) {
          try {
            const errorData = JSON.parse(text);
            errorMsg = errorData?.detail?.message || errorData?.message || errorMsg;
          } catch {
            errorMsg = text;
          }
        }
      } catch {
        // keep status text
      }
      if (response.status === 402) {
        logCreditRechargeNeeded("ElevenLabs");
      }
      return NextResponse.json({ error: `ElevenLabs: ${errorMsg}` }, { status: response.status });
    }

    const audioBuffer = await response.arrayBuffer();
    await recordVoicePreviewUsage({ orgId, provider: voice.provider, model: payload.model_id, text });
    return toAudioResponse(audioBuffer, "audio/mpeg");
  }

  // CARTESIA
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    console.error("[VoicePreview] CARTESIA_API_KEY missing");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const modelId = voice.model.replace(/^cartesia\//, "");
  const text = transcript || "Hello, I am ready to be your AI interviewer.";
  const payload = {
    model_id: modelId,
    transcript: text,
    voice: { mode: "id", id: voiceId },
    output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
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
      const text = await response.text();
      if (text) {
        try {
          const errorData = JSON.parse(text);
          errorMsg = errorData.error?.message || errorData.message || errorMsg;
        } catch {
          errorMsg = text;
        }
      }
    } catch { /* keep statusText */ }
    if (response.status === 402) {
      logCreditRechargeNeeded("Cartesia");
    }
    return NextResponse.json({ error: `Cartesia: ${errorMsg}` }, { status: response.status });
  }

  const audioBuffer = await response.arrayBuffer();
  await recordVoicePreviewUsage({ orgId, provider: voice.provider, model: modelId, text });
  return toAudioResponse(audioBuffer, "audio/mpeg");
}
