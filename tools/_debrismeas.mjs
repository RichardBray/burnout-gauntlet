// _debrismeas.mjs — DEBRIS-ISOLATING shape statistics. Replaces the p99/p50 luma-percentile
// debris metric, which was background-limited (a no-debris control scored the same).
//
// Method: local background = separable box blur of luma at radius --bg (default 15 px, i.e.
// far larger than a debris chip but far smaller than a facade/sky gradient). A pixel is
// DEBRIS if |L - bg| >= --delta. 4-connected components smaller than --minpx or larger than
// --maxpx are dropped (drops JPEG speckle and whole background objects). For each surviving
// blob, second moments give the major/minor axis lengths (4*sqrt(eigenvalue) = full extent of
// an equivalent ellipse), so aspect = major/minor is orientation-free.
// Reports: blob count, fill %, median/p90 major axis px, median aspect, p90 aspect,
// mean signed contrast (are the pieces darker or brighter than their surround), and
// |contrast| (opacity proxy: a translucent sprite has low |contrast|).
//
// Because every statistic is computed ONLY over pixels that differ from their own local
// background, a flat sky strip, a sunlit facade or a gantry sign contributes nothing.
//
// WAVE P CORRECTION — two failure modes of the default args, both found on real anchors:
//
//  (a) THE MASK IS UNSIGNED. `|L - bg| >= delta` accepts blobs DARKER than their surround as
//      readily as brighter ones, so on a tarmac patch the road markings, tyre scuff and shadow
//      edges outnumber the sparks. Measured: `crash-cam` patch A, boost 0, sparks HIDDEN still
//      scores 21 blobs / fill 6.54% against 27 / 7.27% with sparks visible — 78% of the "debris"
//      statistic is road paint. Use `--sign pos` for additive/emissive populations (sparks,
//      embers, glints) and `--sign neg` for silhouetted chips against dust. Default `both` is
//      the historical behaviour and is only meaningful when the patch holds nothing else.
//
//  (b) `--maxpx` SILENTLY DELETES THE SUBJECT. On `crash-cam-04 --patch 0.00,0.30,0.63,0.73`
//      the spark field is so dense that it percolates into ONE connected component holding 63%
//      of the patch; `--maxpx 4000` throws it away and reports the leftover crumbs around it
//      (fill 3.17% with maxpx 4000 vs 66.28% without, at the SAME 63-64 blob count). Every
//      shape statistic then describes the crumbs, not the sparks. `dropPx` below reports the
//      share of masked pixels lost to the minpx/maxpx filters — if it is large the patch's
//      shape statistics are not about the subject and must not be used as an anchor.
//
// Usage:
//   node tools/_debrismeas.mjs --patch x0,x1,y0,y1[:label] [--patch ...]
//        [--bg 15] [--delta 12] [--minpx 4] [--maxpx 4000] [--sign both|pos|neg] file [file...]
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
function opt(n, d) { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; }
const patches = [];
for (;;) { const p = opt('--patch', null); if (!p) break; patches.push(p); }
const BG = +opt('--bg', '15');
const DELTA = +opt('--delta', '12');
const MINPX = +opt('--minpx', '4');
const MAXPX = +opt('--maxpx', '4000');
const SIGN = opt('--sign', 'both');
const files = argv.filter((a) => !a.startsWith('--'));

const browser = await chromium.launch();
const page = await browser.newPage();

for (const f of files) {
  const buf = await readFile(f);
  const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const out = await page.evaluate(async ([data, mimeType, specs, bgR, delta, minpx, maxpx, sign]) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `data:${mimeType};base64,${data}`; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const W = img.width, H = img.height;
    const d = g.getImageData(0, 0, W, H).data;
    const L = new Float64Array(W * H);
    for (let p = 0, i = 0; p < W * H; p++, i += 4) L[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const t1 = new Float64Array(W * H), bg = new Float64Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let k = -bgR; k <= bgR; k++) { const xx = Math.min(W - 1, Math.max(0, x + k)); s += L[y * W + xx]; n++; }
      t1[y * W + x] = s / n;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let k = -bgR; k <= bgR; k++) { const yy = Math.min(H - 1, Math.max(0, y + k)); s += t1[yy * W + x]; n++; }
      bg[y * W + x] = s / n;
    }
    const med = (a) => a.length ? a.slice().sort((p, q) => p - q)[Math.floor(a.length * 0.5)] : 0;
    const pct = (a, q) => a.length ? a.slice().sort((p, o) => p - o)[Math.min(a.length - 1, Math.floor(a.length * q))] : 0;

    const results = [];
    for (const spec of specs) {
      const [nums, label] = spec.split(':');
      const [fx0, fx1, fy0, fy1] = nums.split(',').map(Number);
      const x0 = Math.round(fx0 * W), x1 = Math.round(fx1 * W), y0 = Math.round(fy0 * H), y1 = Math.round(fy1 * H);
      const pw = x1 - x0, ph = y1 - y0;
      const mask = new Uint8Array(pw * ph);
      let onPx = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const dv = L[y * W + x] - bg[y * W + x];
        const hit = sign === 'pos' ? dv >= delta : sign === 'neg' ? dv <= -delta : Math.abs(dv) >= delta;
        if (hit) { mask[(y - y0) * pw + (x - x0)] = 1; onPx++; }
      }
      // 4-connected labelling
      const lab = new Int32Array(pw * ph).fill(-1);
      const stack = [];
      const blobs = [];
      for (let s = 0; s < pw * ph; s++) {
        if (!mask[s] || lab[s] >= 0) continue;
        const id = blobs.length; stack.length = 0; stack.push(s); lab[s] = id;
        const pts = [];
        while (stack.length) {
          const q = stack.pop(); pts.push(q);
          const qx = q % pw, qy = (q - qx) / pw;
          const nb = [];
          if (qx > 0) nb.push(q - 1);
          if (qx < pw - 1) nb.push(q + 1);
          if (qy > 0) nb.push(q - pw);
          if (qy < ph - 1) nb.push(q + pw);
          for (const nn of nb) if (mask[nn] && lab[nn] < 0) { lab[nn] = id; stack.push(nn); }
        }
        blobs.push(pts);
      }
      const majors = [], aspects = [], areas = [], contrasts = [], absC = [];
      let kept = 0, keptPx = 0;
      for (const pts of blobs) {
        if (pts.length < minpx || pts.length > maxpx) continue;
        let sx = 0, sy = 0;
        for (const q of pts) { const qx = q % pw; sx += qx; sy += (q - qx) / pw; }
        const mx = sx / pts.length, my = sy / pts.length;
        let cxx = 0, cyy = 0, cxy = 0, sc = 0;
        for (const q of pts) {
          const qx = q % pw, qy = (q - qx) / pw;
          const a = qx - mx, b = qy - my;
          cxx += a * a; cyy += b * b; cxy += a * b;
          const gx = x0 + qx, gy = y0 + qy;
          sc += L[gy * W + gx] - bg[gy * W + gx];
        }
        cxx /= pts.length; cyy /= pts.length; cxy /= pts.length;
        const tr = cxx + cyy, det = cxx * cyy - cxy * cxy;
        const disc = Math.max(0, tr * tr / 4 - det);
        const e1 = tr / 2 + Math.sqrt(disc), e2 = Math.max(1e-6, tr / 2 - Math.sqrt(disc));
        const major = 4 * Math.sqrt(e1), minor = 4 * Math.sqrt(e2);
        majors.push(major); aspects.push(major / Math.max(0.7, minor)); areas.push(pts.length);
        contrasts.push(sc / pts.length); absC.push(Math.abs(sc / pts.length));
        kept++; keptPx += pts.length;
      }
      results.push({
        label: label || nums, patch: [x0, x1, y0, y1],
        blobs: kept, rawBlobs: blobs.length,
        fillPct: +(100 * keptPx / (pw * ph)).toFixed(2),
        maskPct: +(100 * onPx / (pw * ph)).toFixed(2),
        // share of masked pixels thrown away by the minpx/maxpx filters. Large => the shape
        // statistics below describe the residue, not the subject. See header note (b).
        dropPct: +(100 * (onPx - keptPx) / Math.max(1, onPx)).toFixed(1),
        majMed: +med(majors).toFixed(1), majP90: +pct(majors, 0.9).toFixed(1),
        areaMed: +med(areas).toFixed(1),
        aspMed: +med(aspects).toFixed(2), aspP90: +pct(aspects, 0.9).toFixed(2),
        meanContrast: +(contrasts.reduce((a, b) => a + b, 0) / Math.max(1, contrasts.length)).toFixed(1),
        meanAbsContrast: +(absC.reduce((a, b) => a + b, 0) / Math.max(1, absC.length)).toFixed(1),
      });
    }
    return { W, H, results };
  }, [buf.toString('base64'), mime, patches, BG, DELTA, MINPX, MAXPX, SIGN]);

  console.log(`\n== ${f}  ${out.W}x${out.H}  bg=${BG} delta=${DELTA} minpx=${MINPX} maxpx=${MAXPX} sign=${SIGN}`);
  for (const r of out.results) {
    console.log(`  ${String(r.label).padEnd(14)} blobs=${String(r.blobs).padStart(4)}/${String(r.rawBlobs).padEnd(5)} fill=${String(r.fillPct).padStart(5)}% mask=${String(r.maskPct).padStart(5)}% drop=${String(r.dropPct).padStart(5)}% ` +
      `majMed=${String(r.majMed).padStart(5)} majP90=${String(r.majP90).padStart(6)} areaMed=${String(r.areaMed).padStart(6)} ` +
      `aspMed=${String(r.aspMed).padStart(5)} aspP90=${String(r.aspP90).padStart(5)} contrast=${String(r.meanContrast).padStart(6)} |c|=${r.meanAbsContrast}`);
  }
}
await browser.close();
