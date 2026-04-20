import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { voiceId, transcript, modelId } = await req.json();

    if (!voiceId) {
      return NextResponse.json({ error: "Voice ID is required" }, { status: 400 });
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
      transcript: transcript || `Hello, I am ready to be your AI interviewer.`,
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
      } catch (_e) {
          const text = await response.text();
          if (text) errorMsg = text;
      }
      console.error(`[VoicePreview] Cartesia API error for Voice ID ${voiceId}:`, errorMsg);
      return NextResponse.json({ error: `Cartesia: ${errorMsg}` }, { status: response.status });
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (err) {
    console.error("[VoicePreview] Internal error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
