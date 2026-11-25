/**
 * Generates the app icon (assets/app-icon.png, 1024²) from code: a line-art DDR5 stick on a
 * dark rounded tile. Pure Node + pngjs — no image tooling needed. Then run:
 *   pnpm --dir ui exec tauri icon assets/app-icon.png --output app/icons
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../assets/app-icon.png');

const SIZE = 1024;
const SS = 2; // supersampling factor
const N = SIZE * SS;
const buf = new Float64Array(N * N * 4);

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Porter–Duff "over" with straight alpha. */
function over(x, y, c, a) {
  const i = (y * N + x) * 4;
  const o = 1 - a;
  buf[i] = buf[i] * o + c[0] * a;
  buf[i + 1] = buf[i + 1] * o + c[1] * a;
  buf[i + 2] = buf[i + 2] * o + c[2] * a;
  buf[i + 3] = buf[i + 3] * o + a;
}

function insideRound(x0, y0, w, h, r, x, y) {
  if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false;
  const cx = x < x0 + r ? x0 + r : x >= x0 + w - r ? x0 + w - r : x;
  const cy = y < y0 + r ? y0 + r : y >= y0 + h - r ? y0 + h - r : y;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}

function roundRect(x, y, w, h, r, color, alpha = 1) {
  const c = rgb(color);
  for (let py = Math.floor(y * SS); py < Math.ceil((y + h) * SS); py++) {
    for (let px = Math.floor(x * SS); px < Math.ceil((x + w) * SS); px++) {
      if (insideRound(x * SS, y * SS, w * SS, h * SS, r * SS, px + 0.5, py + 0.5)) over(px, py, c, alpha);
    }
  }
}

function ringRoundRect(x, y, w, h, r, t, color) {
  const c = rgb(color);
  for (let py = Math.floor(y * SS); py < Math.ceil((y + h) * SS); py++) {
    for (let px = Math.floor(x * SS); px < Math.ceil((x + w) * SS); px++) {
      const fx = px + 0.5;
      const fy = py + 0.5;
      if (insideRound(x * SS, y * SS, w * SS, h * SS, r * SS, fx, fy) && !insideRound((x + t) * SS, (y + t) * SS, (w - 2 * t) * SS, (h - 2 * t) * SS, (r - t) * SS, fx, fy)) {
        over(px, py, c, 1);
      }
    }
  }
}

// ---- the drawing (1024-unit space) ---------------------------------------
roundRect(0, 0, SIZE, SIZE, 224, '#0d1117');

// PCB
roundRect(150, 380, 724, 232, 20, '#0f3d34');
ringRoundRect(150, 380, 724, 232, 20, 12, '#3aa98a');

// four DRAM dies, each with a 4 × 4 "page grid" in the app's use-class colours
const HUES = ['#4cc2ff', '#3fe0a0', '#ff9e5e', '#b48cff', '#ffc233'];
const PATTERN = [0, 0, 1, 0, 0, 3, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 4, 0, 0];
for (let d = 0; d < 4; d++) {
  const cx = 190 + d * 168;
  const cy = 420;
  roundRect(cx, cy, 132, 152, 10, '#05070a');
  ringRoundRect(cx, cy, 132, 152, 10, 6, '#33404f');
  for (let r = 0; r < 4; r++) {
    for (let q = 0; q < 4; q++) {
      const k = (d * 8 + r * 4 + q) % PATTERN.length;
      roundRect(cx + 14 + q * 28, cy + 24 + r * 28, 20, 20, 4, HUES[PATTERN[k]]);
    }
  }
}

// gold fingers + the DDR5 key notch
for (let i = 0; i < 21; i++) {
  const x = 166 + i * 35;
  if (x > 196 && x < 242) continue; // notch
  roundRect(x, 612, 18, i % 3 === 2 ? 32 : 44, 3, '#b98a3c');
}
roundRect(210, 566, 24, 46, 0, '#0d1117');

// ---- downsample + encode --------------------------------------------------
const out = new PNG({ width: SIZE, height: SIZE });
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * N + x * SS + sx) * 4;
        r += buf[i] * buf[i + 3];
        g += buf[i + 1] * buf[i + 3];
        b += buf[i + 2] * buf[i + 3];
        a += buf[i + 3];
      }
    }
    const k = a > 0 ? 1 / a : 0;
    const o = (y * SIZE + x) * 4;
    out.data[o] = Math.round(r * k);
    out.data[o + 1] = Math.round(g * k);
    out.data[o + 2] = Math.round(b * k);
    out.data[o + 3] = Math.round((a / (SS * SS)) * 255);
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(out));
console.log('wrote', OUT);
