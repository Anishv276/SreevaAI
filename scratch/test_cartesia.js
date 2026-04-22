require('dotenv').config();

async function testCartesia() {
    const apiKey = process.env.CARTESIA_API_KEY;
    const voiceId = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"; // Jacqueline
    const modelId = "sonic-3"; // The model used in the app

    const payload = {
        model_id: modelId,
        transcript: "Hello, this is a test of the Cartesia TTS system.",
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

    try {
        console.log("Testing Cartesia with API Key:", apiKey ? apiKey.substring(0, 10) + "..." : "MISSING");
        if (!apiKey) return;

        const response = await fetch("https://api.cartesia.ai/tts/bytes", {
            method: "POST",
            headers: {
                "X-API-Key": apiKey,
                "Cartesia-Version": "2024-06-10",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        console.log("Response status:", response.status);
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Cartesia API Error:", errorText);
        } else {
            const buffer = await response.arrayBuffer();
            console.log("Response length:", buffer.byteLength);
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
}

testCartesia();
