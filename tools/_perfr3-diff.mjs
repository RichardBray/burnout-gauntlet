// wave-s perf-r3 — per-pixel BEFORE/AFTER comparison for the regression gate.
// Decodes both PNGs in a headless chromium canvas (the repo has no PNG decoder in node; every
// other tool here does the same thing) and reports max / mean / coverage plus a 16x9 grid of mean
// difference, which is what localises a change to an object instead of a number.
//
//   node tools/_perfr3-diff.mjs A.png B.png [amplified-out.png]
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [aPath, bPath, ampOut] = process.argv.slice(2);
const b64 = async (p) => (await readFile(p)).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
const res = await page.evaluate(async ([a, b, wantAmp]) => {
  const load = (d) => new Promise((ok, no) => {
    const im = new Image(); im.onload = () => ok(im); im.onerror = no;
    im.src = 'data:image/png;base64,' + d;
  });
  const [A, B] = await Promise.all([load(a), load(b)]);
  if (A.width !== B.width || A.height !== B.height) throw new Error('size mismatch');
  const px = (im) => {
    const c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(im, 0, 0);
    return x.getImageData(0, 0, im.width, im.height);
  };
  const da = px(A).data, db = px(B).data, W = A.width, H = A.height;
  let max = 0, sum = 0, o2 = 0, o8 = 0;
  const grid = [], gn = [];
  for (let i = 0; i < 9; i++) { grid.push(new Array(16).fill(0)); gn.push(new Array(16).fill(0)); }
  const amp = wantAmp ? new Uint8ClampedArray(W * H * 4) : null;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]),
        Math.abs(da[i + 2] - db[i + 2]));
      if (d > max) max = d;
      sum += d; if (d > 2) o2++; if (d > 8) o8++;
      const gy = Math.min(8, Math.floor(y / (H / 9))), gx = Math.min(15, Math.floor(x / (W / 16)));
      grid[gy][gx] += d; gn[gy][gx]++;
      if (amp) { const v = Math.min(255, d * 12); amp[i] = v; amp[i + 1] = v; amp[i + 2] = v; amp[i + 3] = 255; }
    }
  }
  let out = null;
  if (amp) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').putImageData(new ImageData(amp, W, H), 0, 0);
    out = c.toDataURL('image/png').split(',')[1];
  }
  return { W, H, max, mean: sum / (W * H), o2: 100 * o2 / (W * H), o8: 100 * o8 / (W * H),
    grid: grid.map((row, gy) => row.map((v, gx) => v / gn[gy][gx])), amp: out };
}, [await b64(aPath), await b64(bPath), !!ampOut]);
await browser.close();
console.log(`${aPath} vs ${bPath}  (${res.W}x${res.H})`);
console.log(`maxDiff ${res.max}  meanDiff ${res.mean.toFixed(4)}  %px>2/255 ${res.o2.toFixed(4)}%  %px>8/255 ${res.o8.toFixed(4)}%`);
console.log('16x9 grid of mean difference:');
for (const row of res.grid) console.log('  ' + row.map((v) => v.toFixed(2).padStart(6)).join(''));
if (ampOut) { await writeFile(ampOut, Buffer.from(res.amp, 'base64')); console.log('amplified (12x) -> ' + ampOut); }
process.exit(0);
