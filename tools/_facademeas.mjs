// _facademeas.mjs — facade-band edge density + colour, the environment r8/r9 numbers.
//
//   node tools/_facademeas.mjs shots/x.png reference/daytime-downtown-01.jpg ...
//   node tools/_facademeas.mjs --band 0.05,0.55 --sky 8,110 files...
//
// Reports, over the facade band (default y 5-55% of frame height, full width) with
// sky pixels excluded:
//   sobel     mean Sobel gradient magnitude of luma
//   strong%   fraction of band pixels whose Sobel magnitude exceeds --strong (30)
//   sat       mean HSV saturation
//   sky%      fraction of the band masked off as sky
//   darkAll%  dark pixels as a fraction of the WHOLE band rectangle, sky included.
//             `dark%` divides by the NON-SKY population only, and the sky mask is a
//             blue-and-bright test that the scene's own blue airlight feeds — so
//             changing the haze moves both the numerator AND the denominator and
//             dark% is not comparable across an airlight A/B. Measured: an airlight
//             near-field change moved this band's non-sky population 586282 ->
//             645045 px on an identical 1035k-px rectangle. Quote darkAll% for any
//             comparison that touches atmosphere. (Wave P, environment.)
//   cSpread   BLOCK-CHROMATICITY SPREAD x1000 — the replacement for `sat`.
//             `sat` is dominated by the additive blue airlight cast (a grey mass
//             under blue haze reads as saturated blue; a warm cream mass cancels it
//             and reads neutral), so it is INVERTED with respect to architectural
//             colour and was retired in wave O. cSpread instead measures how far
//             apart the masses are from EACH OTHER in chromaticity: rg-chromaticity
//             is median-filtered over --blk (default 16) px blocks, and cSpread is
//             the mean Euclidean distance of a block from the band's median block.
//             An additive cast is a CONTRACTION toward one chromaticity, so it can
//             only SHRINK this; distinct paints can only grow it. Blocks that are
//             majority-sky are dropped.
// Sky mask: blue-dominant AND bright, i.e. (B - R) >= dB and luma >= minL.
// Images are normalised to 1920 px wide first so the gradient operator sees the
// same spatial frequency on a 5000 px press still as on our 1920 px render.
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
const band = opt('--band', '0.05,0.55').split(',').map(Number);
const xband = opt('--x', '0,1').split(',').map(Number);
const sky = opt('--sky', '8,110').split(',').map(Number);
const strong = +opt('--strong', '30');
const normW = +opt('--normw', '1920');
const blk = +opt('--blk', '16');
const files = argv.filter((a) => !a.startsWith('--'));

const browser = await chromium.launch();
const page = await browser.newPage();

for (const f of files) {
  const buf = await readFile(f);
  const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const r = await page.evaluate(async ([data, mimeType, bd, sk, st, nw, xb, bk]) => {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = rej;
      img.src = `data:${mimeType};base64,${data}`;
    });
    const scale = nw / img.width;
    const W = Math.round(img.width * scale), H = Math.round(img.height * scale);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const L = new Float64Array(W * H);
    const isSky = new Uint8Array(W * H);
    for (let p = 0, i = 0; p < W * H; p++, i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      L[p] = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      if (B - R >= sk[0] && L[p] >= sk[1]) isSky[p] = 1;
    }
    const y0 = Math.max(1, Math.round(bd[0] * H));
    const y1 = Math.min(H - 1, Math.round(bd[1] * H));
    let sum = 0, n = 0, nStrong = 0, satSum = 0, nSky = 0, lumSum = 0, nDark = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = Math.max(1, Math.round(xb[0] * W)); x < Math.min(W - 1, Math.round(xb[1] * W)); x++) {
        const p = y * W + x;
        if (isSky[p]) { nSky++; continue; }
        const gx = (L[p - W - 1] + 2 * L[p - 1] + L[p + W - 1])
                 - (L[p - W + 1] + 2 * L[p + 1] + L[p + W + 1]);
        const gy = (L[p - W - 1] + 2 * L[p - W] + L[p - W + 1])
                 - (L[p + W - 1] + 2 * L[p + W] + L[p + W + 1]);
        const m = Math.hypot(gx, gy) / 4;   // /4 keeps the operator unit-gain
        sum += m; n++;
        if (m > st) nStrong++;
        const i = p * 4;
        const mx = Math.max(d[i], d[i + 1], d[i + 2]);
        const mn = Math.min(d[i], d[i + 1], d[i + 2]);
        satSum += mx > 0 ? (mx - mn) / mx : 0;
        lumSum += L[p];
        if (L[p] < 32) nDark++;
      }
    }
    // --- block-chromaticity spread (cSpread) --------------------------------
    // rg-chromaticity is intensity-normalised, so it is blind to the value
    // structure `dark%` already reports and answers only "what colour is this
    // mass". Median inside the block kills per-pixel texture noise and JPEG
    // chroma blocking; the spread is then a mass-to-mass statistic.
    const bx0 = Math.max(1, Math.round(xb[0] * W));
    const bx1 = Math.min(W - 1, Math.round(xb[1] * W));
    const blocks = [];
    const rs = [], gs = [];
    for (let by = y0; by + bk <= y1; by += bk) {
      for (let bx = bx0; bx + bk <= bx1; bx += bk) {
        let skyN = 0; rs.length = 0; gs.length = 0;
        for (let y = by; y < by + bk; y++) {
          for (let x = bx; x < bx + bk; x++) {
            const p = y * W + x;
            if (isSky[p]) { skyN++; continue; }
            const i = p * 4;
            const s = d[i] + d[i + 1] + d[i + 2] + 1;
            rs.push(d[i] / s); gs.push(d[i + 1] / s);
          }
        }
        if (skyN > bk * bk * 0.5 || rs.length < 8) continue;
        rs.sort((a, b) => a - b); gs.sort((a, b) => a - b);
        const m = rs.length >> 1;
        blocks.push([rs[m], gs[m]]);
      }
    }
    let cSpread = 0;
    if (blocks.length > 4) {
      const rr = blocks.map((b) => b[0]).sort((a, b) => a - b);
      const gg = blocks.map((b) => b[1]).sort((a, b) => a - b);
      const cr = rr[rr.length >> 1], cg = gg[gg.length >> 1];
      let acc = 0;
      for (const [r, g] of blocks) acc += Math.hypot(r - cr, g - cg);
      cSpread = (acc / blocks.length) * 1000;
    }

    return {
      size: [img.width, img.height], norm: [W, H], n,
      sobel: sum / n, strongFrac: nStrong / n, sat: satSum / n,
      lum: lumSum / n, darkFrac: nDark / n,
      darkAll: nDark / (nSky + n),
      cSpread, nBlocks: blocks.length,
      skyFrac: nSky / (nSky + n),
    };
  }, [buf.toString('base64'), mime, band, sky, strong, normW, xband, blk]);

  console.log(
    f.replace(/^.*\//, '').padEnd(30),
    `${r.size[0]}x${r.size[1]}->${r.norm[0]}x${r.norm[1]}`.padEnd(22),
    'sobel', r.sobel.toFixed(2).padStart(6),
    '| strong%', (r.strongFrac * 100).toFixed(1).padStart(5),
    '| sat', r.sat.toFixed(3),
    '| lum', r.lum.toFixed(1).padStart(5),
    '| dark%', (r.darkFrac * 100).toFixed(1).padStart(5),
    '| darkAll%', (r.darkAll * 100).toFixed(2).padStart(5),
    '| cSpread', r.cSpread.toFixed(2).padStart(6),
    '| sky%', (r.skyFrac * 100).toFixed(1).padStart(5),
    '| px', r.n,
  );
}
await browser.close();
