// Wave Q road critic: (1) paired control for _bandmeas `ratio`'s isotropic null,
// (2) sparsity/skew of the 5x5 high-pass residual (sparkle vs emboss).
// usage: node /tmp/q-aniso.mjs synth        -> writes /tmp/q-iso.png /tmp/q-vert.png /tmp/q-horiz.png
//        node /tmp/q-aniso.mjs skew --region x0,x1,y0,y1 f1 f2 ...
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const mode = argv.shift();
const browser = await chromium.launch();
const page = await browser.newPage();

if (mode === 'synth') {
  // 1920x1080, mid grey + noise. iso = white noise; vert = down-road (column) streaks,
  // i.e. coherent along y; horiz = transverse bands, coherent along x.
  for (const kind of ['iso', 'vert', 'horiz', 'isoblur']) {
    const url = await page.evaluate(async (k) => {
      const W = 1920, H = 1080;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      const im = ctx.createImageData(W, H);
      // deterministic LCG
      let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff - 0.5; };
      const f = new Float64Array(W * H);
      if (k === 'iso') { for (let i = 0; i < W * H; i++) f[i] = rnd(); }
      if (k === 'vert') { // constant down a 8px run -> elongated vertically
        for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) f[y * W + x] = (y % 8 === 0) ? rnd() : f[(y - 1) * W + x];
      }
      if (k === 'horiz') {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f[y * W + x] = (x % 8 === 0) ? rnd() : f[y * W + x - 1];
      }
      if (k === 'isoblur') { // isotropic but multi-pixel: 3x3 box of white noise
        const g = new Float64Array(W * H); for (let i = 0; i < W * H; i++) g[i] = rnd();
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          let a = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) a += g[(y + dy) * W + x + dx];
          f[y * W + x] = a / 9;
        }
      }
      let mx = 0; for (let i = 0; i < W * H; i++) mx = Math.max(mx, Math.abs(f[i]));
      for (let i = 0, p = 0; p < W * H; p++, i += 4) {
        const v = Math.max(0, Math.min(255, Math.round(100 + f[p] / mx * 60)));
        im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
      }
      ctx.putImageData(im, 0, 0);
      return cv.toDataURL('image/png');
    }, kind);
    await writeFile(`/tmp/q-${kind}.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', `/tmp/q-${kind}.png`);
  }
} else {
  const i = argv.indexOf('--region');
  const reg = argv[i + 1].split(',').map(Number); argv.splice(i, 2);
  for (const f of argv) {
    const buf = await readFile(f);
    const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const r = await page.evaluate(async ([data, mimeType, reg]) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `data:${mimeType};base64,${data}`; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const x0 = Math.round(reg[0] * img.width), x1 = Math.round(reg[1] * img.width);
      const y0 = Math.round(reg[2] * img.height), y1 = Math.round(reg[3] * img.height);
      const W = x1 - x0, H = y1 - y0;
      const d = g.getImageData(x0, y0, W, H).data;
      const L = new Float64Array(W * H);
      let mean = 0;
      for (let p = 0, i = 0; p < W * H; p++, i += 4) { L[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; mean += L[p]; }
      mean /= W * H;
      const e = [];
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
        let s = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += L[(y + dy) * W + x + dx];
        e.push(L[y * W + x] - s / 25);
      }
      const n = e.length;
      let m2 = 0, m3 = 0; for (const v of e) { m2 += v * v; m3 += v * v * v; }
      const rms = Math.sqrt(m2 / n), skew = (m3 / n) / Math.pow(m2 / n, 1.5);
      const abs = e.map(Math.abs).sort((a, b) => a - b);
      const q = (p) => abs[Math.floor(p * (n - 1))];
      // energy concentration: fraction of total squared energy held by the top 5% of pixels
      const sq = e.map((v) => v * v).sort((a, b) => b - a);
      let top = 0; const k5 = Math.floor(n * 0.05); for (let j = 0; j < k5; j++) top += sq[j];
      return { mean, rms, skew, p50: q(0.5), p99: q(0.99), crest: q(0.999) / rms, top5: top / m2 };
    }, [buf.toString('base64'), mime, reg]);
    console.log(f.padEnd(34), 'mean', r.mean.toFixed(1), '| hfRms', r.rms.toFixed(2),
      'skew', r.skew.toFixed(3), '| p99/p50', (r.p99 / r.p50).toFixed(2),
      'crest(p999/rms)', r.crest.toFixed(2), 'top5%energy', (r.top5 * 100).toFixed(1) + '%');
  }
}
await browser.close();
