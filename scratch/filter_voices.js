import fs from 'fs';
import https from 'https';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/CARTESIA_API_KEY=["']?([^"'\n]+)["']?/);
if (!match) {
  console.error("CARTESIA_API_KEY NOT FOUND");
  process.exit(1);
}

const key = match[1].trim();

const options = {
  hostname: 'api.cartesia.ai',
  path: '/voices',
  method: 'GET',
  headers: {
    'X-API-Key': key,
    'Cartesia-Version': '2024-06-10'
  }
};

const namesToFind = ["Arushi", "Katie", "Brooke", "Ronald", "Jacqueline", "Arno", "Sarah", "Jessica", "Barista"];

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    try {
      const voices = JSON.parse(data);
      const matched = voices.filter(v => 
        namesToFind.some(name => v.name.toLowerCase().includes(name.toLowerCase()))
      );
      
      const simplified = matched.map(v => ({
        id: v.id,
        name: v.name,
        language: v.language,
        is_public: v.is_public
      }));

      console.log(JSON.stringify(simplified, null, 2));
    } catch (e) {
      console.error("Failed to parse response");
    }
  });
});

req.on('error', error => { console.error("Request error:", error); });
req.end();
