import { NextResponse } from "next/server";
import { CARTESIA_VOICES, GOOGLE_VOICES, SARVAM_VOICES, type Voice } from "@/lib/constants/voices";

type VoiceProvider = "CARTESIA" | "SARVAM" | "GOOGLE";

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
  if (normalized === "GOOGLE") {
    return normalized;
  }
  return null;
}

function inferProviderFromVoiceId(voiceId: string): VoiceProvider {
  if (SARVAM_VOICES.some((v: Voice) => v.id === voiceId)) {
    return "SARVAM";
  }
  if (GOOGLE_VOICES.some((v: Voice) => v.id === voiceId)) {
    return "GOOGLE";
  }
  if (CARTESIA_VOICES.some((v: Voice) => v.id === voiceId)) {
    return "CARTESIA";
  }
  return "CARTESIA";
}

function pcmToWav(pcmData: Uint8Array, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
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

  if (provider === "GOOGLE") {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.error("[VoicePreview] GOOGLE_API_KEY missing");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const voiceName = GOOGLE_VOICES.some((v: Voice) => v.id === voiceId) ? voiceId : "Puck";
    const configuredModel = (modelId || process.env.GEMINI_TTS_MODEL || "").trim();
    const model = /tts-preview/i.test(configuredModel) ? configuredModel : "gemini-3.1-flash-tts-preview";
    const prompt = transcript || "Say cheerfully: Hello! I am ready for the interview.";
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },
      },
      model,
    };

    const generateAudio = async () => {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
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
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const inlineData = data?.candidates?.[0]?.content?.parts?.find((part: any) => part?.inlineData?.data)?.inlineData?.data;
      if (typeof inlineData !== "string" || !inlineData.trim()) {
        throw new Error("Invalid audio response from Google Gemini");
      }

      return Buffer.from(inlineData, "base64");
    };

    try {
      let audioBuffer: Buffer;
      try {
        audioBuffer = await generateAudio();
      } catch (err) {
        console.warn("[VoicePreview] Google preview retrying once after error:", err);
        audioBuffer = await generateAudio();
      }
      return toAudioResponse(pcmToWav(audioBuffer), "audio/wav");
    } catch (error: any) {
      console.error(`[VoicePreview] Google API error for Voice ID ${voiceId}:`, error?.message || error);
      return NextResponse.json({ error: `Google Gemini: ${error?.message || "Preview failed"}` }, { status: 500 });
    }
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
