// _plumemeas.mjs — background-subtracted plume geometry and hue ramp.
// Feed it the SAME frame rendered with and without the flame impostors
// (tools/_heromask.mjs writes -fx.png / -noflame.png):
//
//   node tools/_plumemeas.mjs shots/x-fx.png shots/x-noflame.png --box 0.35,0.65,0.72,1.0 --thr 8
//
// Reports, per plume (split at the box centre): the bbox of delta-luma above the
// threshold, its aspect, and an axial profile of the ADDED radiance (delta RGB,
// its saturation, and the composited pixel's saturation) so "the tint ramp dies
// before the plume does" is a table rather than an impression.
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
function opt(n, d) { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; }
const box = opt('--box', '0.35,0.65,0.72,1.0').split(',').map(Number);
const thr = +opt('--thr', '8');
const bins = +opt('--bins', '8');
const [fa, fb] = argv.filter((a) => !a.startsWith('--'));

const browser = await chromium.launch();
const page = await browser.newPage();
const load = async (f) => [(await readFile(f)).toString('base64'), f.endsWith('.png') ? 'image/png' : 'image/jpeg'];
const out = await page.evaluate(async ([A, B, BOX, THR, N]) => {
  const get = async ([data, mime]) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = `data:${mime};base64,${data}`; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
  };
  const a = await get(A), b = await get(B);
  const x0 = Math.round(BOX[0] * a.w), x1 = Math.round(BOX[1] * a.w);
  const y0 = Math.round(BOX[2] * a.h), y1 = Math.round(BOX[3] * a.h);
  const xm = (x0 + x1) >> 1;
  const sat = (r, g2, bl) => { const M = Math.max(r, g2, bl); return M > 1e-6 ? (M - Math.min(r, g2, bl)) / M : 0; };
  const res = [];
  for (const [name, sx0, sx1] of [['left', x0, xm], ['right', xm, x1]]) {
    let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9, n = 0;
    for (let y = y0; y < y1; y++) for (let x = sx0; x < sx1; x++) {
      const i = (y * a.w + x) * 4;
      const dl = 0.2126 * (a.d[i] - b.d[i]) + 0.7152 * (a.d[i + 1] - b.d[i + 1]) + 0.0722 * (a.d[i + 2] - b.d[i + 2]);
      if (dl < THR) continue;
      n++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    const W = bx1 - bx0 + 1, H = by1 - by0 + 1;
    const prof = [];
    for (let k = 0; k < N; k++) {
      const ya = by0 + Math.floor(H * k / N), yb = by0 + Math.floor(H * (k + 1) / N);
      let dr = 0, dg = 0, db = 0, cr = 0, cg = 0, cb = 0, br = 0, m = 0;
      for (let y = ya; y < yb; y++) for (let x = bx0; x <= bx1; x++) {
        const i = (y * a.w + x) * 4;
        const dl = 0.2126 * (a.d[i] - b.d[i]) + 0.7152 * (a.d[i + 1] - b.d[i + 1]) + 0.0722 * (a.d[i + 2] - b.d[i + 2]);
        if (dl < THR) continue;
        dr += a.d[i] - b.d[i]; dg += a.d[i + 1] - b.d[i + 1]; db += a.d[i + 2] - b.d[i + 2];
        cr += a.d[i]; cg += a.d[i + 1]; cb += a.d[i + 2];
        br += 0.2126 * b.d[i] + 0.7152 * b.d[i + 1] + 0.0722 * b.d[i + 2];
        m++;
      }
      if (!m) { prof.push(null); continue; }
      const D = [dr / m, dg / m, db / m], C = [cr / m, cg / m, cb / m];
      const bgL = br / m;
      const cL = 0.2126 * C[0] + 0.7152 * C[1] + 0.0722 * C[2];
      prof.push({ y: ((ya + yb) / 2 / a.h), px: m,
        dRGB: D.map((v) => +v.toFixed(1)), dSat: +sat(...D).toFixed(3),
        gb: +(D[1] / Math.max(D[2], 0.01)).toFixed(2),
        cSat: +sat(...C).toFixed(3), ratio: +(cL / Math.max(bgL, 0.01)).toFixed(2) });
    }
    res.push({ name, px: n, bbox: [bx0, bx1, by0, by1], w: W, h: H,
      aspect: +(H / W).toFixed(2), prof });
  }
  return res;
}, [await load(fa), await load(fb), box, thr, bins]);

for (const p of out) {
  console.log(`${p.name}: bbox x ${p.bbox[0]}..${p.bbox[1]} y ${p.bbox[2]}..${p.bbox[3]}  ` +
    `${p.w}x${p.h} px  aspect(H/W) ${p.aspect}:1  lit px ${p.px}`);
  console.log('   y      px    dR    dG    dB   dSat  dG/dB  pxSat  L/bg');
  for (const r of p.prof) {
    if (!r) { console.log('   (empty bin)'); continue; }
    console.log(`  ${r.y.toFixed(3)} ${String(r.px).padStart(6)} ` +
      `${r.dRGB.map((v) => String(v).padStart(5)).join(' ')} ${String(r.dSat).padStart(6)} ` +
      `${String(r.gb).padStart(6)} ${String(r.cSat).padStart(6)} ${String(r.ratio).padStart(5)}`);
  }
}
await browser.close();
