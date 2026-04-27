import fs from "fs";
import path from "path";
import zlib from "zlib";

const OUT_DIR = path.join(process.cwd(), "public", "assets", "globe");
const BASE_W = 2048;
const BASE_H = 1024;
const BUMP_W = 1024;
const BUMP_H = 512;
const CLOUD_W = 1024;
const CLOUD_H = 512;

const CONTINENTS = [
  [[-168, 72], [-140, 70], [-126, 61], [-118, 52], [-104, 44], [-95, 31], [-86, 20], [-80, 9], [-92, 8], [-103, 16], [-114, 22], [-126, 31], [-133, 43], [-151, 56], [-168, 62]],
  [[-81, 11], [-74, 5], [-67, -8], [-63, -19], [-58, -31], [-54, -41], [-47, -53], [-38, -54], [-34, -38], [-39, -20], [-48, -2], [-58, 8], [-69, 12]],
  [[-17, 36], [-5, 44], [15, 53], [40, 60], [70, 60], [98, 57], [123, 50], [147, 45], [165, 52], [180, 62], [180, 10], [154, 4], [130, 15], [113, 21], [96, 11], [82, 21], [67, 26], [60, 31], [46, 31], [33, 31], [24, 36], [15, 41], [3, 42], [-8, 40]],
  [[-17, 34], [4, 36], [18, 32], [30, 24], [35, 12], [42, 3], [47, -10], [43, -21], [33, -31], [20, -34], [10, -35], [2, -30], [-7, -16], [-13, 0], [-15, 16]],
  [[40, 31], [49, 30], [56, 27], [54, 17], [48, 12], [44, 15], [42, 22]],
  [[67, 26], [79, 31], [89, 24], [87, 15], [78, 9], [72, 18]],
  [[111, -10], [116, -21], [128, -23], [139, -30], [151, -33], [155, -24], [150, -12], [140, -11], [129, -15], [118, -12]],
  [[-54, 59], [-42, 76], [-25, 80], [-18, 70], [-31, 60]],
];

const RIDGES = [
  [[73, 34], [78, 33], [84, 31], [91, 30], [98, 29], [104, 27]],
  [[5, 45], [11, 46], [17, 46], [23, 45]],
  [[41, 43], [48, 43], [54, 42]],
  [[45, 33], [50, 31], [55, 29], [60, 27]],
  [[-76, -6], [-73, -16], [-70, -26], [-68, -36], [-70, -45]],
  [[-124, 49], [-118, 45], [-112, 40], [-108, 36], [-104, 31]],
  [[36, 12], [39, 9], [41, 6], [39, 2]],
];

function mulberry32(seed) {
  return function rand() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1337);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(min, max, value) {
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function noise2d(x, y, seed = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 101.3) * 43758.5453123;
  return (n - Math.floor(n)) * 2 - 1;
}

function fbm(x, y, octaves = 5, seed = 0) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2d(x * frequency, y * frequency, seed + i * 17.17);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.05;
  }
  return value / norm;
}

function pointInPolygon(lon, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = ((yi > lat) !== (yj > lat))
      && (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function lonLatToPixel(lon, lat, width, height) {
  return [
    ((lon + 180) / 360) * width,
    ((90 - lat) / 180) * height,
  ];
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby || 1e-9;
  const t = clamp((apx * abx + apy * aby) / ab2, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

function distanceToRidge(lon, lat, ridge) {
  let best = Infinity;
  for (let i = 0; i < ridge.length - 1; i++) {
    const [ax, ay] = ridge[i];
    const [bx, by] = ridge[i + 1];
    best = Math.min(best, distanceToSegment(lon, lat, ax, ay, bx, by));
  }
  return best;
}

function buildLandMask(width, height) {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const lat = 90 - (y / height) * 180;
    for (let x = 0; x < width; x++) {
      const lon = (x / width) * 360 - 180;
      let isLand = false;
      for (const polygon of CONTINENTS) {
        if (pointInPolygon(lon, lat, polygon)) {
          isLand = true;
          break;
        }
      }
      mask[y * width + x] = isLand ? 1 : 0;
    }
  }
  return mask;
}

function computeCoastMask(mask, width, height) {
  const coast = new Uint8Array(width * height);
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const land = mask[idx];
      let edge = false;
      for (const [dx, dy] of dirs) {
        if (mask[(y + dy) * width + (x + dx)] !== land) {
          edge = true;
          break;
        }
      }
      coast[idx] = edge ? 1 : 0;
    }
  }
  return coast;
}

function rgbaBuffer(width, height) {
  return Buffer.alloc(width * height * 4);
}

function writePixel(buf, width, x, y, r, g, b, a = 255) {
  const i = (y * width + x) * 4;
  buf[i] = clamp(Math.round(r), 0, 255);
  buf[i + 1] = clamp(Math.round(g), 0, 255);
  buf[i + 2] = clamp(Math.round(b), 0, 255);
  buf[i + 3] = clamp(Math.round(a), 0, 255);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function buildBaseTexture() {
  const width = BASE_W;
  const height = BASE_H;
  const rgba = rgbaBuffer(width, height);
  const landMask = buildLandMask(width, height);
  const coastMask = computeCoastMask(landMask, width, height);

  for (let y = 0; y < height; y++) {
    const lat = 90 - (y / height) * 180;
    const latNorm = y / height;
    for (let x = 0; x < width; x++) {
      const lon = (x / width) * 360 - 180;
      const idx = y * width + x;
      const isLand = landMask[idx] === 1;
      const coast = coastMask[idx] === 1;
      const macro = fbm(x / width * 2.8, y / height * 2.2, 5, 11);
      const detail = fbm(x / width * 10.5, y / height * 7.8, 4, 27);
      const polarShade = 1 - Math.abs(lat) / 90;

      if (!isLand) {
        const oceanBand = 0.22 + 0.16 * polarShade + macro * 0.05;
        const r = lerp(3, 12, oceanBand);
        const g = lerp(10, 28, oceanBand);
        const b = lerp(18, 52, oceanBand + detail * 0.04);
        writePixel(rgba, width, x, y, r, g, b, 255);
        continue;
      }

      let ridgeBoost = 0;
      for (const ridge of RIDGES) {
        const dist = distanceToRidge(lon, lat, ridge);
        ridgeBoost = Math.max(ridgeBoost, smoothstep(8, 0, dist));
      }

      const dryness = clamp(0.35 + macro * 0.18 + detail * 0.1, 0, 1);
      const elevation = clamp(0.28 + macro * 0.24 + detail * 0.14 + ridgeBoost * 0.4, 0, 1);
      let r = lerp(42, 98, dryness) + ridgeBoost * 18;
      let g = lerp(48, 104, elevation) + ridgeBoost * 16;
      let b = lerp(44, 82, 0.4 + detail * 0.16) + ridgeBoost * 12;

      if (coast) {
        r += 18;
        g += 22;
        b += 24;
      }

      const nightFactor = latNorm > 0.82 || latNorm < 0.12 ? 0.92 : 1;
      writePixel(rgba, width, x, y, r * nightFactor, g * nightFactor, b * nightFactor, 255);
    }
  }

  const cityCenters = [
    [10, 50], [77, 23], [116, 39], [139, 35], [31, 30], [-74, 41], [-118, 34], [28, -26], [72, 19],
  ];
  for (const [lon, lat] of cityCenters) {
    const [cx, cy] = lonLatToPixel(lon, lat, width, height);
    for (let i = 0; i < 80; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = rand() * 18;
      const x = Math.round(cx + Math.cos(angle) * radius);
      const y = Math.round(cy + Math.sin(angle) * radius);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const alpha = 0.12 * (1 - radius / 18);
      const idx = (y * width + x) * 4;
      rgba[idx] = clamp(rgba[idx] + 255 * alpha, 0, 255);
      rgba[idx + 1] = clamp(rgba[idx + 1] + 185 * alpha, 0, 255);
      rgba[idx + 2] = clamp(rgba[idx + 2] + 96 * alpha, 0, 255);
    }
  }

  return encodePng(width, height, rgba);
}

function buildBumpTexture() {
  const width = BUMP_W;
  const height = BUMP_H;
  const rgba = rgbaBuffer(width, height);
  const landMask = buildLandMask(width, height);

  for (let y = 0; y < height; y++) {
    const lat = 90 - (y / height) * 180;
    for (let x = 0; x < width; x++) {
      const lon = (x / width) * 360 - 180;
      const idx = y * width + x;
      const isLand = landMask[idx] === 1;
      const macro = fbm(x / width * 3.4, y / height * 2.6, 5, 41);
      const detail = fbm(x / width * 12.0, y / height * 9.0, 4, 53);
      let ridgeBoost = 0;
      if (isLand) {
        for (const ridge of RIDGES) {
          const dist = distanceToRidge(lon, lat, ridge);
          ridgeBoost = Math.max(ridgeBoost, smoothstep(9, 0, dist));
        }
      }
      const base = isLand ? 78 : 32;
      const heightValue = base + macro * 36 + detail * 24 + ridgeBoost * 92 + (Math.abs(lat) > 60 ? 10 : 0);
      writePixel(rgba, width, x, y, heightValue, heightValue, heightValue, 255);
    }
  }

  return encodePng(width, height, rgba);
}

function buildCloudTexture() {
  const width = CLOUD_W;
  const height = CLOUD_H;
  const rgba = rgbaBuffer(width, height);

  for (let y = 0; y < height; y++) {
    const latNorm = y / height;
    for (let x = 0; x < width; x++) {
      const belt = Math.sin(latNorm * Math.PI * 3.1) * 0.5 + 0.5;
      const macro = fbm(x / width * 4.5, y / height * 2.4, 5, 77);
      const detail = fbm(x / width * 15.0, y / height * 8.5, 3, 91);
      const density = clamp(belt * 0.34 + macro * 0.24 + detail * 0.16 - 0.12, 0, 1);
      const alpha = Math.round(255 * density * 0.24);
      writePixel(rgba, width, x, y, 230, 236, 244, alpha);
    }
  }

  return encodePng(width, height, rgba);
}

function writeFile(name, buffer) {
  const full = path.join(OUT_DIR, name);
  fs.writeFileSync(full, buffer);
  const stat = fs.statSync(full);
  console.log(`${name} ${(stat.size / 1024).toFixed(1)} KB`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
writeFile("earth-dark-base.png", buildBaseTexture());
writeFile("earth-dark-bump.png", buildBumpTexture());
writeFile("earth-dark-clouds.png", buildCloudTexture());
