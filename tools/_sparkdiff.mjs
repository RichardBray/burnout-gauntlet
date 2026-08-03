// Spark-attributable luma DIFFERENCE statistic. Takes a sparks-VISIBLE and a sparks-HIDDEN
// render of the same boot and reports percentiles of (L_vis - L_hid) over a patch, plus the
// total added luma (an exposure-like integral). No threshold, no mask, no connected components,
// so nothing can be diluted by recruiting marginal pixels.
// usage: node /tmp/q-sparkdiff.mjs vis.png hid.png x0,x1,y0,y1
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const [fv, fh, patch] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage();
const out = await p.evaluate(async ([dv, dh, spec]) => {
  const load = async (d) => { const i = new Image(); await new Promise(r => { i.onload = r; i.src = 'data:image/png;base64,' + d; }); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0); return { d: g.getImageData(0, 0, i.width, i.height).data, W: i.width, H: i.height }; };
  const V = await load(dv), Hd = await load(dh);
  const [fx0, fx1, fy0, fy1] = spec.split(',').map(Number);
  const W = V.W, H = V.H;
  const x0 = Math.round(fx0 * W), x1 = Math.round(fx1 * W), y0 = Math.round(fy0 * H), y1 = Math.round(fy1 * H);
  const lum = (a, i) => 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
  const diffs = []; let sum = 0, n = 0, over = 0, over40 = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 4;
    const dl = lum(V.d, i) - lum(Hd.d, i);
    n++; if (dl > 0) { sum += dl; diffs.push(dl); if (dl >= 20) over++; if (dl >= 40) over40++; }
  }
  diffs.sort((a, c) => a - c);
  const q = (t) => diffs.length ? +diffs[Math.min(diffs.length - 1, Math.floor(t * diffs.length))].toFixed(2) : 0;
  return { patchPx: n, posPx: diffs.length, addedLumaPerPx: +(sum / n).toFixed(3), p50: q(0.5), p90: q(0.9), p99: q(0.99), max: q(1), pctGE20: +(100 * over / n).toFixed(3), pctGE40: +(100 * over40 / n).toFixed(3) };
}, [(await readFile(fv)).toString('base64'), (await readFile(fh)).toString('base64'), patch]);
console.log(`${fv}  ${JSON.stringify(out)}`);
await b.close();
