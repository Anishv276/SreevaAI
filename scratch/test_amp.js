const fs = require('fs');
const buf = fs.readFileSync('scratch/test_sarvam_audio.wav');
// Skip RIFF header (44 bytes for standard wave)
const pcm = buf.slice(44);
let maxAmp = 0;
for (let i = 0; i < pcm.length; i += 2) {
    let sample = pcm.readInt16LE(i);
    if (Math.abs(sample) > maxAmp) maxAmp = Math.abs(sample);
}
console.log("Max Amplitude:", maxAmp);
