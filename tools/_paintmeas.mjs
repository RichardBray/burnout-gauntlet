// _paintmeas.mjs — car-paint specific measurements on a rect of an image.
//   node tools/_paintmeas.mjs file.png x0 x1 y0 y1   (fractions of frame)
// Reports: mean luminance, p50/p90/p99, spec:diffuse ratio (p99/p50),
// flake grain (RMS of high-pass residual vs 3x3 box, + grain autocorrelation
// period in px), and a vertical highlight FWHM scan at the rect's mid column.
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [file, ...nums] = process.argv.slice(2);
const [x0f, x1f, y0f, y1f] = nums.map(Number);
const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = (await readFile(file)).toString('base64');
const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';

const out = await page.evaluate(async ([data, mimeType, r]) => {
  const img = new Image();
  img.src = `data:${mimeType};base64,` + data;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const L = (x, y) => {
    const i = (y * c.width + x) * 4;
    return 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  };
  const x0 = Math.floor(r[0] * c.width), x1 = Math.floor(r[1] * c.width);
  const y0 = Math.floor(r[2] * c.height), y1 = Math.floor(r[3] * c.height);
  const W = x1 - x0, H = y1 - y0;

  // luminance field
  const f = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f[y * W + x] = L(x0 + x, y0 + y);
  const sorted = Array.from(f).sort((a, b) => a - b);
  const q = (p) => +sorted[Math.floor((sorted.length - 1) * p)].toFixed(1);
  const mean = f.reduce((a, b) => a + b, 0) / f.length;

  // high-pass residual vs 3x3 box -> flake / micro-detail energy
  const res = new Float64Array(W * H);
  let ss = 0, nres = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += f[(y + dy) * W + x + dx];
    const d = f[y * W + x] - s / 9;
    res[y * W + x] = d; ss += d * d; nres++;
  }
  const grainRMS = Math.sqrt(ss / nres);

  // horizontal autocorrelation of residual -> grain period (first zero crossing *2)
  const ac = [];
  for (let lag = 0; lag <= 12; lag++) {
    let s = 0, n = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1 - lag; x++) {
      s += res[y * W + x] * res[y * W + x + lag]; n++;
    }
    ac.push(s / n);
  }
  const acn = ac.map((v) => +(v / ac[0]).toFixed(3));
  let zc = null;
  for (let i = 1; i < acn.length; i++) if (acn[i] <= 0) { zc = i - 1 + acn[i - 1] / (acn[i - 1] - acn[i]); break; }

  // vertical profile at mid column band (avg of 9 columns) for highlight FWHM
  const xm = Math.floor((x0 + x1) / 2);
  const prof = [];
  for (let y = y0; y < y1; y++) {
    let s = 0;
    for (let d = -4; d <= 4; d++) s += L(xm + d, y);
    prof.push(+(s / 9).toFixed(1));
  }
  // FWHM of the brightest peak relative to local floor (min of profile)
  const pmax = Math.max(...prof), pmin = Math.min(...prof);
  const half = (pmax + pmin) / 2;
  const pi = prof.indexOf(pmax);
  let a = pi, b = pi;
  while (a > 0 && prof[a] > half) a--;
  while (b < prof.length - 1 && prof[b] > half) b++;

  return {
    size: [W, H], mean: +mean.toFixed(1),
    p05: q(0.05), p50: q(0.5), p90: q(0.9), p99: q(0.99),
    specDiff: +(q(0.99) / Math.max(0.1, q(0.5))).toFixed(2),
    grainRMS: +grainRMS.toFixed(2),
    grainRMSpct: +(100 * grainRMS / Math.max(1, mean)).toFixed(2),
    autocorr: acn, grainPeriodPx: zc === null ? '>24' : +(2 * zc).toFixed(1),
    hlPeak: pmax, hlFloor: pmin, hlFWHMpx: b - a,
    profile: prof.filter((_, i) => i % 4 === 0),
  };
}, [b64, mime, [x0f, x1f, y0f, y1f]]);

console.log(file, JSON.stringify(out, null, 1));
await browser.close();
