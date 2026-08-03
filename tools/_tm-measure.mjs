// _tm-measure.mjs — tonemapper A/B metrics on any PNG/JPEG.
//   node tools/_tm-measure.mjs [--json] file1 file2 ...
// Emits, per image, the numbers a tonemapper decision actually turns on:
//   blk    1st-percentile luminance (0..255) — the black point
//   p0     % of pixels with luma < 4 (crushed to black)
//   p25/p50/p75/p99  luminance percentiles
//   mtc    midtone contrast = p75-p25 over pixels in the 32..224 band
//   clip   % of pixels with any channel >= 254
//   wclip  % of pixels with ALL channels >= 254 (blown to paper white)
//   satHi  mean HSV saturation of the brightest 5% of pixels (sodium/neon/brake retention)
//   satAll mean HSV saturation over the frame
//   cast   mean R:G:B normalised so G = 1.000 (warm > 1 on R)
//   roll   highlight rolloff: mean luma of the 95..99.5 percentile band minus p95,
//          scaled — small = hard shoulder/clipping, large = long smooth shoulder
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const files = argv.filter((a) => !a.startsWith('--'));

const browser = await chromium.launch();
const page = await browser.newPage();

const rows = [];
for (const f of files) {
  const buf = await readFile(f);
  const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const b64 = buf.toString('base64');
  const r = await page.evaluate(async ([data, mimeType]) => {
    const img = new Image();
    img.src = `data:${mimeType};base64,` + data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const px = x.getImageData(0, 0, c.width, c.height).data;
    const n = px.length / 4;

    const hist = new Float64Array(256);
    const lum = new Uint8Array(n);
    let sr = 0, sg = 0, sb = 0, clip = 0, wclip = 0, satSum = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const R = px[j], G = px[j + 1], B = px[j + 2];
      const L = Math.round(0.2126 * R + 0.7152 * G + 0.0722 * B);
      lum[i] = L; hist[L]++;
      sr += R; sg += G; sb += B;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      if (mx >= 254 || G >= 254 || B >= 254) { /* noop */ }
      if (R >= 254 || G >= 254 || B >= 254) clip++;
      if (R >= 254 && G >= 254 && B >= 254) wclip++;
      satSum += mx === 0 ? 0 : (mx - mn) / mx;
    }
    const pct = (p) => {
      let want = n * p / 100, acc = 0;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= want) return v; }
      return 255;
    };
    const p1 = pct(1), p25 = pct(25), p50 = pct(50), p75 = pct(75),
      p95 = pct(95), p99 = pct(99), p995 = pct(99.5);

    // midtone contrast over the 32..224 band only
    let mAcc = 0, mN = 0;
    const mh = [];
    for (let v = 32; v <= 224; v++) { mAcc += hist[v]; }
    let want25 = mAcc * 0.25, want75 = mAcc * 0.75, a = 0, q25 = 32, q75 = 224, got25 = false;
    for (let v = 32; v <= 224; v++) {
      a += hist[v];
      if (!got25 && a >= want25) { q25 = v; got25 = true; }
      if (a >= want75) { q75 = v; break; }
    }
    mN = mAcc;

    // saturation of the brightest 5%, plus the saturated TAIL of that population —
    // a sodium lamp or a brake light is a tiny pixel count, so a mean over the whole
    // bright population is swamped by sky. satTail is the p90 of saturation among
    // bright pixels; vivid is the % of the frame that is both bright and chromatic,
    // which is the direct "does a saturated highlight survive the transform" number.
    const thr = p95;
    let hiS = 0, hiN = 0, vivid = 0;
    const satHist = new Float64Array(101);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const R = px[j], G = px[j + 1], B = px[j + 2];
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      const s = mx === 0 ? 0 : (mx - mn) / mx;
      if (lum[i] >= 128 && s >= 0.5) vivid++;
      if (lum[i] < thr) continue;
      hiS += s; hiN++;
      satHist[Math.round(s * 100)]++;
    }
    let sAcc = 0, satTail = 0;
    for (let v = 0; v <= 100; v++) { sAcc += satHist[v]; if (sAcc >= hiN * 0.9) { satTail = v / 100; break; } }

    // dark-pixel fraction
    let dark = 0;
    for (let v = 0; v < 4; v++) dark += hist[v];

    const gm = sg / n;
    return {
      w: c.width, h: c.height,
      blk: p1, p0: +(dark / n * 100).toFixed(2),
      p25, p50, p75, p95, p99,
      mtc: q75 - q25,
      clip: +(clip / n * 100).toFixed(3),
      wclip: +(wclip / n * 100).toFixed(3),
      satHi: +(hiN ? hiS / hiN : 0).toFixed(4),
      satTail: +satTail.toFixed(2),
      vivid: +(vivid / n * 100).toFixed(3),
      satAll: +(satSum / n).toFixed(4),
      castR: +((sr / n) / gm).toFixed(4),
      castB: +((sb / n) / gm).toFixed(4),
      meanL: +((0.2126 * sr + 0.7152 * sg + 0.0722 * sb) / n).toFixed(2),
      roll: p995 - p95,
    };
  }, [b64, mime]);
  r.file = f.split('/').pop();
  rows.push(r);
}
await browser.close();

if (asJson) { console.log(JSON.stringify(rows, null, 2)); }
else {
  const cols = ['file', 'blk', 'p0', 'p25', 'p50', 'p75', 'p95', 'p99', 'mtc',
    'clip', 'wclip', 'satHi', 'satTail', 'vivid', 'satAll', 'castR', 'castB', 'meanL', 'roll'];
  const wid = cols.map((c) => Math.max(c.length,
    ...rows.map((r) => String(r[c]).length)));
  const line = (vals) => vals.map((v, i) => String(v).padEnd(wid[i])).join('  ');
  console.log(line(cols));
  for (const r of rows) console.log(line(cols.map((c) => r[c])));
}
