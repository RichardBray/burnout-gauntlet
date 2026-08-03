// _smearmeas.mjs — pixel-domain radial smear length in an arbitrary patch.
//
// Method: luma -> high-pass (subtract 7x7 box) -> normalized 1-D autocorrelation
// sampled bilinearly along a direction, at lags 0..maxLag px. The lag at which the
// autocorrelation first crosses 0.5 is the half-width of the smear footprint; the
// reported smearPx = 2 * that, i.e. the effective kernel length in pixels.
// Also reports the perpendicular (tangential) length and the anisotropy ratio,
// which is what separates a real directional smear from generic softness / mip blur.
//
// Usage:
//   node tools/_smearmeas.mjs --foc 0.504,0.508 --patch x0,x1,y0,y1[:label] ... file
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
function opt(n, d) { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; }
const patches = [];
for (;;) { const p = opt('--patch', null); if (!p) break; patches.push(p); }
const foc = opt('--foc', '0.5,0.5').split(',').map(Number);
const maxLag = +opt('--maxlag', '110');
const files = argv.filter((a) => !a.startsWith('--'));

const browser = await chromium.launch();
const page = await browser.newPage();

for (const f of files) {
  const buf = await readFile(f);
  const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const out = await page.evaluate(async ([data, mimeType, patchSpecs, focus, ML]) => {
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
    // separable 7x7 box blur -> high pass
    const R = 3;
    const tmp = new Float64Array(W * H), lo = new Float64Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let k = -R; k <= R; k++) { const xx = Math.min(W - 1, Math.max(0, x + k)); s += L[y * W + xx]; n++; }
      tmp[y * W + x] = s / n;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let k = -R; k <= R; k++) { const yy = Math.min(H - 1, Math.max(0, y + k)); s += tmp[yy * W + x]; n++; }
      lo[y * W + x] = s / n;
    }
    const HP = new Float64Array(W * H);
    for (let p = 0; p < W * H; p++) HP[p] = L[p] - lo[p];

    const samp = (arr, x, y) => {
      if (x < 0 || y < 0 || x > W - 2 || y > H - 2) return null;
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const a = arr[yi * W + xi], b = arr[yi * W + xi + 1], cc = arr[(yi + 1) * W + xi], dd = arr[(yi + 1) * W + xi + 1];
      return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + cc * (1 - fx) * fy + dd * fx * fy;
    };

    const results = [];
    for (const spec of patchSpecs) {
      const [nums, label] = spec.split(':');
      const [fx0, fx1, fy0, fy1] = nums.split(',').map(Number);
      const x0 = Math.round(fx0 * W), x1 = Math.round(fx1 * W), y0 = Math.round(fy0 * H), y1 = Math.round(fy1 * H);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      let rx = cx - focus[0] * W, ry = cy - focus[1] * H;
      const rl = Math.hypot(rx, ry) || 1; rx /= rl; ry /= rl;
      const dirs = { rad: [rx, ry], tan: [-ry, rx] };
      for (let a = 0; a < 180; a += 5) dirs['a' + a] = [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)];
      const res = { label: label || nums, patch: [x0, x1, y0, y1] };
      // patch RMS for context
      let m = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { m += HP[y * W + x] * HP[y * W + x]; n++; }
      res.hpRms = Math.sqrt(m / n);
      for (const [k, dv] of Object.entries(dirs)) {
        const ac = [];
        for (let lag = 0; lag <= ML; lag++) {
          let sxy = 0, sxx = 0, syy = 0, cnt = 0;
          for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
            const a = HP[y * W + x];
            const b = samp(HP, x + dv[0] * lag, y + dv[1] * lag);
            if (b === null) continue;
            sxy += a * b; sxx += a * a; syy += b * b; cnt++;
          }
          ac.push(cnt < 40 ? 0 : sxy / Math.sqrt(sxx * syy));
        }
        // first crossing of 0.5, linear interp
        let half = ML;
        for (let i = 1; i <= ML; i++) {
          if (ac[i] < 0.5) { half = (i - 1) + (ac[i - 1] - 0.5) / (ac[i - 1] - ac[i] || 1); break; }
        }
        res[k + 'Half'] = half;
        res[k + 'Smear'] = 2 * half;
      }
      res.aniso = res.radSmear / Math.max(0.001, res.tanSmear);
      // direction-free: best and worst axis over a 5-deg sweep
      let best = -1, bestA = 0, worst = 1e9;
      for (let a = 0; a < 180; a += 5) {
        const h = res['a' + a + 'Half'];
        if (h > best) { best = h; bestA = a; }
        if (h < worst) worst = h;
      }
      res.maxSmear = 2 * best; res.maxAngle = bestA; res.minSmear = 2 * worst;
      res.anisoFree = best / Math.max(0.001, worst);
      results.push(res);
    }
    return { W, H, results };
  }, [buf.toString('base64'), mime, patches, foc, maxLag]);

  console.log(`\n== ${f}  ${out.W}x${out.H}`);
  const k = 1920 / out.W;
  for (const r of out.results) {
    console.log(
      `  ${String(r.label).padEnd(16)} maxSmear=${r.maxSmear.toFixed(1)}px @${String(r.maxAngle).padStart(3)}deg` +
      `  (norm@1920w=${(r.maxSmear * k).toFixed(1)})  minSmear=${r.minSmear.toFixed(1)}  aniso=${r.anisoFree.toFixed(2)}` +
      `  radSmear=${r.radSmear.toFixed(1)}  hpRms=${r.hpRms.toFixed(2)}`);
  }
}
await browser.close();
