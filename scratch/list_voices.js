import fs from 'fs';
import https from 'https';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/CARTESIA_API_KEY=["']?([^"'\n]+)["']?/);
if (!match) {
  console.error("CARTESIA_API_KEY NOT FOUND");
  process.exit(1);
}

const key = match[1].trim();
console.log("Using key:", key.substring(0, 4) + "...");

const options = {
  hostname: 'api.cartesia.ai',
  path: '/voices',
  method: 'GET',
  headers: {
    'X-API-Key': key,
    'Cartesia-Version': '2024-06-10'
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    try {
      const voices = JSON.parse(data);
      console.log(JSON.stringify(voices, null, 2));
    } catch (e) {
      console.error("Failed to parse response:", data);
    }
  });
});

req.on('error', error => { console.error("Request error:", error); });
req.end();
