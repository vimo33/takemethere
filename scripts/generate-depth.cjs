const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/generate-depth.cjs <input-image> <output-depth-png>');
  process.exit(2);
}

if (!fs.existsSync(inputPath)) {
  console.error(`Input image does not exist: ${inputPath}`);
  process.exit(2);
}

const width = Number(process.env.DEPTH_WIDTH || 1024);
const height = Number(process.env.DEPTH_HEIGHT || 576);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, encodePng(width, height, createDepthPixels(width, height)));

function createDepthPixels(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const v = y / (height - 1);
      const horizon = 0.54;
      const ground = Math.max(0, (v - horizon) / (1 - horizon));
      const sky = Math.max(0, (horizon - v) / horizon);
      const centerPull = 1 - Math.min(1, Math.hypot((u - 0.5) * 1.35, (v - 0.55) * 1.1));
      const sideLayer = Math.max(0, 1 - Math.abs(u - 0.5) * 2);
      const softNoise = Math.sin(u * 31.7 + v * 17.3) * 0.025 + Math.sin(u * 79.1) * Math.sin(v * 42.7) * 0.018;
      const value = clamp(0.14 + sky * 0.22 + ground * 0.62 + centerPull * 0.16 + sideLayer * 0.08 + softNoise, 0, 1);
      const gray = Math.round(value * 255);
      const i = (y * width + x) * 4;
      pixels[i] = gray;
      pixels[i + 1] = gray;
      pixels[i + 2] = gray;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
