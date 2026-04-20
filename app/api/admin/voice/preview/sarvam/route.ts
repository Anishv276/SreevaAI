import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { voiceId, transcript, modelId } = await req.json();

    if (!voiceId) {
      return NextResponse.json({ error: "Voice ID is required" }, { status: 400 });
    }

    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      console.error("[SarvamVoicePreview] SARVAM_API_KEY missing");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const model = modelId || "bulbul:v3";
    const payload = {
        inputs: [transcript || "Namaste, I am ready for the interview."],
        target_language_code: "hi-IN",
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
      } catch (_e) {
          const text = await response.text();
          if (text) errorMsg = text;
      }
      console.error(`[SarvamVoicePreview] API error for Voice ID ${voiceId}:`, errorMsg);
      return NextResponse.json({ error: `Sarvam AI: ${errorMsg}` }, { status: response.status });
    }

    const data = await response.json();
    if (!data.audios || !data.audios[0]) {
       return NextResponse.json({ error: "Invalid audio response from Sarvam AI" }, { status: 500 });
    }

    const audioBuffer = Buffer.from(data.audios[0], "base64");

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (err) {
    console.error("[SarvamVoicePreview] Internal error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
