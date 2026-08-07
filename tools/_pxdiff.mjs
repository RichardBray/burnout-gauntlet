// Per-pixel difference between two renders: max per-channel delta and the share of pixels that
// differ at all. This is the instrument the visual regression gate is read with, and it is
// deliberately NOT an md5: `STATE.md` records that this renderer produces a different framebuffer
// for the same bytes on every run (21 renders of one tree, 21 distinct md5s), so the honest bar is
// "at or under the same-tree noise floor", which needs a magnitude, not an equality.
//   node tools/_pxdiff.mjs a.png b.png
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const files = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
for (let i = 0; i + 1 < files.length; i += 2) {
  const [a, b] = [files[i], files[i + 1]];
  const out = await page.evaluate(async ([da, db]) => {
    const load = async (d) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = `data:image/png;base64,${d}`; });
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, 0, 0);
      return { d: g.getImageData(0, 0, im.width, im.height).data, W: im.width, H: im.height };
    };
    const A = await load(da), B = await load(db);
    if (A.W !== B.W || A.H !== B.H) return { error: 'size mismatch' };
    let maxd = 0, ndiff = 0, sum = 0;
    const n = A.W * A.H;
    for (let p = 0; p < n; p++) {
      const j = p * 4;
      const d0 = Math.abs(A.d[j] - B.d[j]);
      const d1 = Math.abs(A.d[j + 1] - B.d[j + 1]);
      const d2 = Math.abs(A.d[j + 2] - B.d[j + 2]);
      const m = Math.max(d0, d1, d2);
      if (m > 0) { ndiff++; sum += m; }
      if (m > maxd) maxd = m;
    }
    return { px: n, maxd, pctDiff: +(100 * ndiff / n).toFixed(4), meanAbs: +(sum / n).toFixed(4) };
  }, [(await readFile(a)).toString('base64'), (await readFile(b)).toString('base64')]);
  console.log(`${a.split('/').pop()} vs ${b.split('/').pop()}  maxd ${out.maxd}  ${out.pctDiff}%  mean ${out.meanAbs}`);
}
await browser.close();
