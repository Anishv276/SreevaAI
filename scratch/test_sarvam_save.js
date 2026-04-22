require('dotenv').config();
const fs = require('fs');

async function testSarvamSave() {
    const apiKey = process.env.SARVAM_API_KEY;
    const payload = {
        inputs: ["Namaste."],
        target_language_code: "en-IN",
        speaker: "shubh",
        pace: 1.0,
        speech_sample_rate: 22050,
        model: "bulbul:v3",
    };

    const response = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: {
            "api-subscription-key": apiKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();
    const buffer = Buffer.from(data.audios[0], "base64");
    fs.writeFileSync('scratch/test_sarvam_audio.wav', buffer);
    console.log("Saved to scratch/test_sarvam_audio.wav, size:", buffer.length);
}

testSarvamSave();
