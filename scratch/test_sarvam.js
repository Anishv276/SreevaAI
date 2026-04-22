require('dotenv').config();

async function testSarvam() {
    const apiKey = process.env.SARVAM_API_KEY;
    const voiceId = "shubh"; 
    const modelId = "bulbul:v3";

    const payload = {
        inputs: ["Namaste, this is a test of the Sarvam TTS system."],
        target_language_code: "en-IN",
        speaker: voiceId,
        pace: 1.0,
        speech_sample_rate: 22050,
        model: modelId,
        temperature: 0.6,
    };

    try {
        console.log("Testing Sarvam with API Key:", apiKey ? apiKey.substring(0, 10) + "..." : "MISSING");
        if (!apiKey) return;

        const response = await fetch("https://api.sarvam.ai/text-to-speech", {
            method: "POST",
            headers: {
                "api-subscription-key": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        console.log("Response status:", response.status);
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Sarvam API Error:", errorText);
        } else {
            const data = await response.json();
            console.log("Audios received:", data.audios ? data.audios.length : 0);
            if (data.audios && data.audios[0]) {
                console.log("First audio length (base64):", data.audios[0].length);
            }
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
}

testSarvam();
