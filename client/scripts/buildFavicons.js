import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Write the modern geometric SVG favicon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" fill="none">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#080e1a"/>
      <stop offset="100%" stop-color="#04070d"/>
    </linearGradient>
    <linearGradient id="cGrad" x1="12" y1="12" x2="42" y2="52" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#06b6d4"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
    <linearGradient id="plusGrad" x1="36" y1="23" x2="54" y2="41" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#67e8f9"/>
      <stop offset="100%" stop-color="#22d3ee"/>
    </linearGradient>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#06b6d4" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- Modern Dark Squircle Tile (high-contrast across light and dark browser themes) -->
  <rect width="64" height="64" rx="16" fill="url(#bgGrad)"/>
  <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15.25" stroke="#164e63" stroke-width="1.5" stroke-opacity="0.8"/>

  <!-- Minimal Geometric Lettermark "C" -->
  <path d="M 41 16.5 C 37.5 14 33 13 28.5 13 C 18 13 11 20.5 11 32 C 11 43.5 18 51 28.5 51 C 33 51 37.5 50 41 47.5"
        stroke="url(#cGrad)"
        stroke-width="7"
        stroke-linecap="round"
        stroke-linejoin="round"
        filter="url(#softGlow)"/>

  <!-- Balanced Geometric Plus "+" Sign -->
  <g filter="url(#softGlow)">
    <line x1="36" y1="32" x2="53" y2="32" stroke="url(#plusGrad)" stroke-width="6" stroke-linecap="round"/>
    <line x1="44.5" y1="23.5" x2="44.5" y2="40.5" stroke="url(#plusGrad)" stroke-width="6" stroke-linecap="round"/>
  </g>

  <!-- Subtle High-Tech Core Node -->
  <circle cx="28.5" cy="32" r="2.5" fill="#a5f3fc" opacity="0.95"/>
</svg>
`;

fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent, 'utf8');
console.log('✓ Created favicon.svg');

// 2. High-precision procedural PNG rasterizer with super-sampling (SSAA)
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rawOffset = y * (width * 4 + 1);
    raw[rawOffset] = 0;
    rgba.copy(raw, rawOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idatChunk = makeChunk('IDAT', zlib.deflateSync(raw, { level: 9 }));
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function encodeICO(pngList) {
  const count = pngList.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = [];
  let currentOffset = 6 + count * 16;
  for (const item of pngList) {
    const entry = Buffer.alloc(16);
    entry[0] = item.width >= 256 ? 0 : item.width;
    entry[1] = item.height >= 256 ? 0 : item.height;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(item.buffer.length, 8);
    entry.writeUInt32LE(currentOffset, 12);
    entries.push(entry);
    currentOffset += item.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngList.map(p => p.buffer)]);
}

function distSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay;
  const bax = bx - ax, bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy);
}

function distRoundedRect(x, y, w, h, r) {
  const qx = Math.abs(x - w / 2) - (w / 2 - r);
  const qy = Math.abs(y - h / 2) - (h / 2 - r);
  const outside = Math.sqrt(Math.max(0, qx) ** 2 + Math.max(0, qy) ** 2);
  const inside = Math.min(0, Math.max(qx, qy));
  return outside + inside - r;
}

function renderFavicon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = size <= 64 ? 4 : 2;
  const step = 1 / samples;

  const bgRadius = size * 0.25;
  const cx = size * 0.44;
  const cy = size * 0.50;
  const cRadius = size * 0.28;
  const cThick = Math.max(2.0, size * 0.115);

  const px = size * 0.70;
  const py = size * 0.50;
  const pArm = size * 0.13;
  const pThick = Math.max(1.8, size * 0.10);

  const arcStart = -52 * (Math.PI / 180);
  const arcEnd = 52 * (Math.PI / 180);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rAcc = 0, gAcc = 0, bAcc = 0, aAcc = 0;

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const subX = x + (sx + 0.5) * step;
          const subY = y + (sy + 0.5) * step;

          const dBox = distRoundedRect(subX, subY, size, size, bgRadius);
          if (dBox > 0) continue;

          const diag = (subX + subY) / (size * 2);
          let bgR = Math.round(8 * (1 - diag) + 4 * diag);
          let bgG = Math.round(14 * (1 - diag) + 7 * diag);
          let bgB = Math.round(26 * (1 - diag) + 13 * diag);

          if (dBox > -size * 0.04) {
            bgR = Math.round(bgR * 0.5 + 22 * 0.5);
            bgG = Math.round(bgG * 0.5 + 78 * 0.5);
            bgB = Math.round(bgB * 0.5 + 99 * 0.5);
          }

          const dx = subX - cx;
          const dy = subY - cy;
          const dCenter = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);

          let dC = 999;
          if (angle < arcStart || angle > arcEnd) {
            dC = Math.abs(dCenter - cRadius) - cThick / 2;
          } else {
            const p1x = cx + cRadius * Math.cos(arcStart);
            const p1y = cy + cRadius * Math.sin(arcStart);
            const p2x = cx + cRadius * Math.cos(arcEnd);
            const p2y = cy + cRadius * Math.sin(arcEnd);
            const d1 = Math.sqrt((subX - p1x) ** 2 + (subY - p1y) ** 2) - cThick / 2;
            const d2 = Math.sqrt((subX - p2x) ** 2 + (subY - p2y) ** 2) - cThick / 2;
            dC = Math.min(d1, d2);
          }

          const dPlusH = distSegment(subX, subY, px - pArm, py, px + pArm, py) - pThick / 2;
          const dPlusV = distSegment(subX, subY, px, py - pArm, px, py + pArm) - pThick / 2;
          const dPlus = Math.min(dPlusH, dPlusV);

          const dDot = Math.sqrt((subX - (cx - size * 0.01)) ** 2 + (subY - cy) ** 2) - (size * 0.038);

          let pixR = bgR, pixG = bgG, pixB = bgB;

          if (dC < 0) {
            const gradT = (subY / size);
            pixR = Math.round(56 * (1 - gradT) + 2 * gradT);
            pixG = Math.round(189 * (1 - gradT) + 132 * gradT);
            pixB = Math.round(248 * (1 - gradT) + 199 * gradT);
          }

          if (dPlus < 0) {
            pixR = 34;
            pixG = 211;
            pixB = 238;
          }

          if (dDot < 0) {
            pixR = 165;
            pixG = 243;
            pixB = 252;
          }

          rAcc += pixR;
          gAcc += pixG;
          bAcc += pixB;
          aAcc += 255;
        }
      }

      const total = samples * samples;
      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(rAcc / total);
      rgba[idx + 1] = Math.round(gAcc / total);
      rgba[idx + 2] = Math.round(bAcc / total);
      rgba[idx + 3] = Math.round(aAcc / total);
    }
  }

  return rgba;
}

// Render sizes
const sizes = [16, 32, 48, 180, 192, 512];
const pngBuffers = {};

for (const s of sizes) {
  const buf = renderFavicon(s);
  const png = encodePNG(s, s, buf);
  pngBuffers[s] = png;
}

fs.writeFileSync(path.join(publicDir, 'favicon-16x16.png'), pngBuffers[16]);
console.log('✓ Created favicon-16x16.png');

fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), pngBuffers[32]);
console.log('✓ Created favicon-32x32.png');

fs.writeFileSync(path.join(publicDir, 'favicon-48x48.png'), pngBuffers[48]);
console.log('✓ Created favicon-48x48.png');

fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), pngBuffers[180]);
console.log('✓ Created apple-touch-icon.png (180x180)');

fs.writeFileSync(path.join(publicDir, 'android-chrome-192x192.png'), pngBuffers[192]);
console.log('✓ Created android-chrome-192x192.png');

fs.writeFileSync(path.join(publicDir, 'android-chrome-512x512.png'), pngBuffers[512]);
console.log('✓ Created android-chrome-512x512.png');

// Multi-res ICO file containing 16, 32, 48
const icoBuffer = encodeICO([
  { width: 16, height: 16, buffer: pngBuffers[16] },
  { width: 32, height: 32, buffer: pngBuffers[32] },
  { width: 48, height: 48, buffer: pngBuffers[48] },
]);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
console.log('✓ Created multi-resolution favicon.ico');

// Web App Manifest
const manifest = {
  name: "CyberITA+ Practical IT Training",
  short_name: "CyberITA+",
  description: "Practical IT Training Platform with browser-based Linux labs, verified reports, and certificates.",
  icons: [
    {
      src: "/favicon-16x16.png",
      sizes: "16x16",
      type: "image/png"
    },
    {
      src: "/favicon-32x32.png",
      sizes: "32x32",
      type: "image/png"
    },
    {
      src: "/android-chrome-192x192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any maskable"
    },
    {
      src: "/android-chrome-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable"
    }
  ],
  theme_color: "#05070d",
  background_color: "#05070d",
  display: "standalone",
  start_url: "/"
};

fs.writeFileSync(path.join(publicDir, 'site.webmanifest'), JSON.stringify(manifest, null, 2), 'utf8');
console.log('✓ Created site.webmanifest');
