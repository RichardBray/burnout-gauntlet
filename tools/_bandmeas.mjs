// _bandmeas.mjs — directional banding + high-frequency energy in a road region.
// Answers the r7 road critic's two numbers directly:
//   rowBandRel  RMS of the high-passed ROW means / region mean  -> TRANSVERSE (cross-road) bands
//   colBandRel  RMS of the high-passed COLUMN means / region mean -> DOWN-ROAD streaks
//   ratio       rowBandRel/colBandRel. Wet refs sit 0.54:1 (-02) .. 2.8:1 (-01); choppy water >> 3.
//   hfRms       RMS of (pixel luma - 5x5 box blur), chip-scale glint energy
//   hfRmsNorm   hfRms rescaled to a common region mean (--lum, default 101.4) for fair compare
// Usage:
//   node tools/_bandmeas.mjs [--region x0,x1,y0,y1] [--lum 101.4] fileA fileB ...
// Region defaults to the wet near/mid road: 0.14,0.86,0.60,0.98 (frame fractions).
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
function opt(name, def) {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
}
const region = opt('--region', '0.14,0.86,0.60,0.98').split(',').map(Number);
const targetLum = +opt('--lum', '101.4');
// High-pass radius on the 1-D profiles, in pixels. R=4 is the default and is what
// reproduces the r7 critic's reference numbers; R=2 isolates the chip/ripple-scale
// serration from coarse reflected image content (facade window rows etc.).
const hpR = +opt('--hp', '4');
const files = argv.filter((a) => !a.startsWith('--'));

const browser = await chromium.launch();
const page = await browser.newPage();

for (const f of files) {
  const buf = await readFile(f);
  const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const r = await page.evaluate(async ([data, mimeType, reg, HPR]) => {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = rej;
      img.src = `data:${mimeType};base64,${data}`;
    });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const x0 = Math.round(reg[0] * img.width), x1 = Math.round(reg[1] * img.width);
    const y0 = Math.round(reg[2] * img.height), y1 = Math.round(reg[3] * img.height);
    const W = x1 - x0, H = y1 - y0;
    const d = g.getImageData(x0, y0, W, H).data;
    const L = new Float64Array(W * H);
    let mean = 0;
    for (let i = 0, p = 0; p < W * H; p++, i += 4) {
      L[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      mean += L[p];
    }
    mean /= W * H;

    // 1-D profiles
    const rows = new Float64Array(H), cols = new Float64Array(W);
    for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) s += L[y * W + x]; rows[y] = s / W; }
    for (let x = 0; x < W; x++) { let s = 0; for (let y = 0; y < H; y++) s += L[y * W + x]; cols[x] = s / H; }

    // high-pass a profile: subtract a box mean of radius R, then RMS
    const hp = (a, R) => {
      const n = a.length;
      let acc = 0, cnt = 0;
      for (let i = 0; i < n; i++) {
        let s = 0, k = 0;
        for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) { s += a[j]; k++; }
        const e = a[i] - s / k;
        acc += e * e; cnt++;
      }
      return Math.sqrt(acc / cnt);
    };
    // Scale the high-pass radius with image width so a 5000 px reference and a
    // 1920 px render are compared at the SAME ANGULAR scale, not the same pixel count.
    const R = Math.max( 1, Math.round( HPR * img.width / 1920 ) );
    const rowBand = hp(rows, R), colBand = hp(cols, R);

    // 2-D high pass, 5x5 box
    let hacc = 0, hcnt = 0;
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        let s = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += L[(y + dy) * W + x + dx];
        const e = L[y * W + x] - s / 25;
        hacc += e * e; hcnt++;
      }
    }
    return {
      size: [img.width, img.height], px: [W, H], mean,
      rowBand, colBand, hfRms: Math.sqrt(hacc / hcnt), R,
    };
  }, [buf.toString('base64'), mime, region, hpR]);

  const rbr = r.rowBand / r.mean, cbr = r.colBand / r.mean;
  const norm = r.hfRms * (targetLum / r.mean);
  console.log(
    f.padEnd(46),
    `${r.size[0]}x${r.size[1]}`,
    'mean', r.mean.toFixed(1),
    '| rowBandRel', rbr.toFixed(4),
    'colBandRel', cbr.toFixed(4),
    'ratio', (rbr / Math.max(1e-9, cbr)).toFixed(2) + ':1',
    '| hfRms', r.hfRms.toFixed(2),
    'hfRmsNorm', norm.toFixed(2), 'R', r.R,
  );
}
await browser.close();
