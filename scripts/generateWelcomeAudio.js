const fs = require('node:fs');
const path = require('node:path');

// Generates a valid MPEG-1 Layer 3 (MP3) frame sequence (128 kbps, 44.1 kHz Joint Stereo)
// Header: 0xFF, 0xFB, 0x90, 0x64 -> frame size = 417 bytes
const frameHeader = Buffer.from([0xff, 0xfb, 0x90, 0x64]);
const frameBody = Buffer.alloc(417 - 4, 0x00);
const singleFrame = Buffer.concat([frameHeader, frameBody]);

// Concatenate ~100 frames (~2.6 seconds of audio)
const frameCount = 100;
const totalAudio = Buffer.concat(Array.from({ length: frameCount }, () => singleFrame));

const targetDir = path.resolve(__dirname, '../assets');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const targetPath = path.join(targetDir, 'welcome.mp3');
fs.writeFileSync(targetPath, totalAudio);
console.log(`Successfully generated valid placeholder MP3 at: ${targetPath} (${totalAudio.length} bytes)`);
