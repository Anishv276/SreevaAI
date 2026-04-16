import fs from 'fs';
import https from 'https';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/SARVAM_API_KEY=["']?([^"'\n]+)["']?/);
if (!match) {
  console.error("SARVAM_API_KEY NOT FOUND");
  process.exit(1);
}

const key = match[1].trim();

const payload = JSON.stringify({
    inputs: ["Namaste, I am ready for the interview."],
    target_language_code: "hi-IN",
    speaker: "shubh",
    pace: 1.0,
    speech_sample_rate: 8000,
    enable_preprocessing: true,
    model: "bulbul:v3"
});

const options = {
  hostname: 'api.sarvam.ai',
  path: '/text-to-speech',
  method: 'POST',
  headers: {
    'api-subscription-key': key,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    try {
        if (!res.statusCode || res.statusCode >= 400) {
            console.error("Error from Sarvam:", data);
        } else {
            const result = JSON.parse(data);
            console.log("Success! Audio string length:", result.audios[0].length);
        }
    } catch (e) {
      console.error("Failed to parse response");
    }
  });
});

req.on('error', error => { console.error("Request error:", error); });
req.write(payload);
req.end();
