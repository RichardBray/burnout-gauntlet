// _idealblur.mjs — build the CALIBRATION CEILING for the boost pass.
//
// WHY THIS EXISTS. `wave-q/boost-fx.md` retired `_smearmeas` `maxSmear`/`aniso` as absolute
// cross-image quantities (the estimator reports 34.9 for a known 78 px kernel and 11.4 for a
// known 40 px one, so it is not even proportional). Its replacement targets T1 and T2 are both
// stated RELATIVE to "an ideal radial box blur of that round's own nofx frame at the pass's own
// measured lenPix", to be rendered EVERY round. That control was a throwaway in /tmp and is
// gone, so every future round would have had to re-invent it. It is now a tool.
//
// WHAT IT IS. A pure convex, uniform-weight, TRAILING radial box mean: for each pixel, N taps
// spaced along the ray from the focus of expansion through that pixel, running INWARD (toward
// the focus) only, all weights equal. Deliberately the simplest correct blur:
//   * convex + uniform => it cannot add high-frequency energy anywhere, so its hpRms ratio is a
//     genuine floor rather than a competitor;
//   * trailing (inward-only) => same geometry as `boost.js`'s own mean branch at :335-349, so the
//     comparison is kernel-vs-kernel and not symmetric-vs-trailing;
//   * CONSTANT length over the whole frame, not falloff-modulated. The point of the control is
//     "what does a perfect blur OF THIS LENGTH score", so the length must be the free variable.
//
// Pass the pass's own kernel length. `node tools/_boostkernel.mjs` prints it per probe; use the
// near-tarmac rows for a near-road patch.
//
//   node tools/_idealblur.mjs --foc 0.504,0.508 --len 41.2 --taps 24 \
//     --in shots/r/x-nofx.png --out shots/r/x-ideal41.png
//
// Decoding/encoding goes through a headless chromium canvas, exactly as `_smearmeas.mjs` does,
// because this tree has no PNG codec in node_modules.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
function opt(n, d) { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; }
const foc = opt('--foc', '0.5,0.5').split(',').map(Number);
const len = +opt('--len', '41.2');
const taps = +opt('--taps', '24');
const inFile = resolve(opt('--in', ''));
const outFile = resolve(opt('--out', 'shots/_ideal.png'));

const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = (await readFile(inFile)).toString('base64');
const out = await page.evaluate(async ([data, focus, L, N]) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `data:image/png;base64,${data}`; });
  const W = img.width, H = img.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const src = g.getImageData(0, 0, W, H).data;
  const dst = g.createImageData(W, H);
  const fx = focus[0] * W, fy = focus[1] * H;
  // bilinear fetch, clamped at the border
  const fetch = (x, y, ch) => {
    x = Math.min(W - 1.001, Math.max(0, x)); y = Math.min(H - 1.001, Math.max(0, y));
    const xi = x | 0, yi = y | 0, ax = x - xi, ay = y - yi;
    const i00 = ((yi * W) + xi) * 4 + ch, i10 = i00 + 4, i01 = i00 + W * 4, i11 = i01 + 4;
    return src[i00] * (1 - ax) * (1 - ay) + src[i10] * ax * (1 - ay)
         + src[i01] * (1 - ax) * ay + src[i11] * ax * ay;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let dx = x - fx, dy = y - fy;
    const rl = Math.hypot(dx, dy) || 1;
    dx /= rl; dy /= rl;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < N; i++) {
      // tap centres at (i + 0.5)/N of the kernel, trailing INWARD along the ray
      const t = (i + 0.5) / N * L;
      const sx = x - dx * t, sy = y - dy * t;
      r += fetch(sx, sy, 0); gg += fetch(sx, sy, 1); b += fetch(sx, sy, 2);
    }
    const o = ((y * W) + x) * 4;
    dst.data[o] = r / N; dst.data[o + 1] = gg / N; dst.data[o + 2] = b / N; dst.data[o + 3] = 255;
  }
  g.putImageData(dst, 0, 0);
  return c.toDataURL('image/png');
}, [b64, foc, len, taps]);
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, Buffer.from(out.split(',')[1], 'base64'));
console.log(`ideal radial box blur: len=${len}px taps=${taps} foc=${foc.join(',')} -> ${outFile}`);
await browser.close();
