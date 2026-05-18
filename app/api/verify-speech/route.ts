import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const audio = formData.get("audio") as Blob | null;
        const targetPhrase = (formData.get("targetPhrase") as string | null) ?? "";

        if (!audio || !targetPhrase) {
            return NextResponse.json({ error: "Missing audio or targetPhrase" }, { status: 400 });
        }

        const apiKey = process.env.DEEPGRAM_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Deepgram API key not configured" }, { status: 500 });
        }

        const audioBuffer = await audio.arrayBuffer();

        const response = await fetch(
            "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=false&punctuate=false&language=en",
            {
                method: "POST",
                headers: {
                    "Authorization": `Token ${apiKey}`,
                    "Content-Type": (audio.type && audio.type !== "application/octet-stream") ? audio.type : "audio/webm",
                },
                body: audioBuffer,
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error("[verify-speech] Deepgram HTTP error:", response.status, errText);
            return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
        }

        const data = await response.json();
        console.log("[verify-speech] Deepgram raw:", JSON.stringify(data).slice(0, 300));

        const transcript: string = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

        if (!transcript) {
            console.warn("[verify-speech] Empty transcript from Deepgram");
            return NextResponse.json({ transcript: "", matched: false, error: "empty_transcript" });
        }

        // Expand contractions so "i'm" → "i am", "i've" → "i have" etc.
        const expand = (s: string) => s
            .replace(/i'm/gi, "i am").replace(/i've/gi, "i have").replace(/i'll/gi, "i will")
            .replace(/it's/gi, "it is").replace(/that's/gi, "that is").replace(/can't/gi, "cannot")
            .replace(/won't/gi, "will not").replace(/don't/gi, "do not").replace(/isn't/gi, "is not")
            .replace(/\bm\b/gi, "am"); // "i m" → "i am" (deepgram splits "I'm" into "i m")

        const norm = (s: string) => expand(s).toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
        const spokenNorm = norm(transcript);
        const targetNorm = norm(targetPhrase);

        console.log("[verify-speech] spoken:", spokenNorm, "| target:", targetNorm);

        const targetWords = targetNorm.split(" ").filter(Boolean);
        const spokenWords = new Set(spokenNorm.split(" ").filter(Boolean));
        const matchedCount = targetWords.filter(w => spokenWords.has(w)).length;
        // 80% threshold — handles accent/contraction/minor mishearing
        const matched = matchedCount >= Math.ceil(targetWords.length * 0.8);

        console.log("[verify-speech] matched:", matchedCount, "/", targetWords.length, "=>", matched);

        return NextResponse.json({ transcript, matched, matchedCount, total: targetWords.length });
    } catch (err) {
        console.error("[verify-speech] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
