import { NextResponse } from "next/server";
import { getSelectableVoiceById } from "@/lib/engine-voices";

type VoicePreviewInput = {
  voiceId: string;
  transcript?: string;
};

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

export async function createVoicePreviewResponse(input: VoicePreviewInput) {
  const { voiceId, transcript } = input;

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
      return NextResponse.json({ error: `Sarvam AI: ${errorMsg}` }, { status: response.status });
    }

    const data = await response.json();
    const rawAudio = data.audios?.[0];
    if (typeof rawAudio !== "string" || !rawAudio.trim()) {
      return NextResponse.json({ error: "Invalid audio response from Sarvam AI" }, { status: 500 });
    }
    const base64 = rawAudio.includes(",") ? rawAudio.split(",").pop() || "" : rawAudio;
    const audio = Buffer.from(base64, "base64");
    return toAudioResponse(pcmToWav(audio), "audio/wav");
  }

  if (voice.provider === "ELEVENLABS") {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.error("[VoicePreview] ELEVENLABS_API_KEY missing");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const payload = {
      text: transcript || "Hello, I am ready to be your AI interviewer.",
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
      return NextResponse.json({ error: `ElevenLabs: ${errorMsg}` }, { status: response.status });
    }

    const audioBuffer = await response.arrayBuffer();
    return toAudioResponse(audioBuffer, "audio/mpeg");
  }

  // CARTESIA
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    console.error("[VoicePreview] CARTESIA_API_KEY missing");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const modelId = voice.model.replace(/^cartesia\//, "");
  const payload = {
    model_id: modelId,
    transcript: transcript || "Hello, I am ready to be your AI interviewer.",
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
    return NextResponse.json({ error: `Cartesia: ${errorMsg}` }, { status: response.status });
  }

  const audioBuffer = await response.arrayBuffer();
  return toAudioResponse(audioBuffer, "audio/mpeg");
}
