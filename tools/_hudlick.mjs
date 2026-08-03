// _hudlick.mjs — how TORN each rail of the boost bar is, per rail, from the rail's
// own traced contour. This is the "notch RMS" metric that three rounds in a row
// quoted and nobody put on disk; it is now on disk.
//
//   node tools/_hudlick.mjs <file> <coreX0,coreX1,coreY0,coreY1>
//
// The box is given in FRACTIONS of the frame and must be the bar's SOLID core, the
// same convention as _hudedge.mjs. For every column in the box the tool walks
// outward from the core's centre line to the 50%-of-plateau crossing, which gives a
// sub-pixel contour y(x) for the top rail and one for the bottom rail. Both are
// then reported in units of the bar's own height so that a 1600x900 reference and a
// 1920x1080 render are directly comparable WITHOUT resampling either one (see the
// resolution trap in verdicts/wave-k/hud.md — never upscale a reference for a
// spatial-frequency metric).
//
// Why not the 10-strip p50-luma sd that wave K used: that estimator asks whether the
// median pixel of a 33 x 22 px window is body or background, so it is a step
// function of areal coverage. One lick landing inside one window moves it by ~10
// sd units, which is the width of the whole acceptance band. Measured on this bar,
// changing only the rail noise frequency (same amplitudes) moved the bottom rail's
// 10-strip sd from 24.4 to 7.5 with no visible change in how torn the rail is.
// The contour metrics below use every column, so they do not have that variance.
//
// Reported per rail:
//   rmsHF   rms of the contour after removing a 1-bar-height moving average,
//           in % of bar height. THE tear number: a ruled rail is ~0, a torn rail
//           carries several %. Insensitive to the bar's overall taper or bow.
//   rmsLF   rms of that moving average about its own mean, in % of bar height —
//           i.e. how much the rail BOWS. Big rmsLF with small rmsHF is the
//           "lumpy" reading; the reference has the opposite balance.
//   tear    mean spacing of the high-frequency residual's zero crossings, in % of
//           bar height. This is the tear's spatial wavelength/2: small = fine
//           fray, large = rolling undulation.
//   ampP95  95th percentile of |residual|, in % of bar height — how far the
//           longest tongues reach, without letting one outlier set the number.
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [file, box, botband] = process.argv.slice(2);
if (!file || !box) {
  console.error('usage: node tools/_hudlick.mjs <file> <x0,x1,y0,y1 as fractions> [botLo,botHi in barH]');
  process.exit(1);
}
const B = box.split(',').map(Number);
// WAVE Q: the default 1.5,1.75 band is OFF THE BOTTOM OF THE FRAME on ours and on both
// references, so baseBot is a hard 0 and thrBot is exactly plateau/2 (see wave-o/hud.md).
// Pass e.g. `0.35,0.60` to sample a band that is in frame on all three images. The tool
// now prints which band it used and whether it was in frame, so the 0 can never be silent.
const BB = (botband || '0.35,0.60').split(',').map(Number);

const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = (await readFile(file)).toString('base64');
const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';

const out = await page.evaluate(async ([data, mimeType, bx, bb]) => {
  const img = new Image();
  img.src = `data:${mimeType};base64,` + data;
  await img.decode();
  const W = img.width, H = img.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, W, H).data;
  const lum = (x, y) => {
    const i = (y * W + x) * 4;
    return 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  };

  const cx0 = Math.round(bx[0] * W), cx1 = Math.round(bx[1] * W);
  const cy0 = Math.round(bx[2] * H), cy1 = Math.round(bx[3] * H);
  const barH = cy1 - cy0;
  const cyMid = (cy0 + cy1) >> 1;
  const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };

  // plateau: the core box's own median, i.e. the lit body's level
  const core = [];
  for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) core.push(lum(x, y));
  const plateau = med(core);

  // local background per rail: a 0.25-bar-height band 1.5 bar-heights outside the
  // core, which is clear of the halo on every image measured so far
  const bandMed = (ya, yb) => {
    const v = [];
    for (let y = Math.max(0, ya); y < Math.min(H, yb); y++) for (let x = cx0; x < cx1; x++) v.push(lum(x, y));
    return v.length ? med(v) : 0;
  };
  const baseTop = bandMed(Math.round(cy0 - barH * 1.75), Math.round(cy0 - barH * 1.5));
  const bbLo = Math.round(cy1 + barH * bb[0]), bbHi = Math.round(cy1 + barH * bb[1]);
  const baseBot = bandMed(bbLo, bbHi);
  const botBandInFrame = bbLo < H && bbHi <= H;

  // trace one rail: from the centre line outward to the 50% crossing
  function trace(dir, base) {
    const thr = base + 0.5 * (plateau - base);
    const reach = Math.round(barH * 1.6);
    const ys = [];
    for (let x = cx0; x < cx1; x++) {
      let found = null;
      let prev = lum(x, cyMid), prevY = cyMid;
      for (let k = 1; k <= reach; k++) {
        const y = cyMid + dir * k;
        if (y < 0 || y >= H) break;
        const v = lum(x, y);
        if (prev >= thr && v < thr) { found = prevY + dir * (prev - thr) / (prev - v); break; }
        prev = v; prevY = y;
      }
      ys.push(found === null ? cyMid + dir * reach : found);
    }
    return { ys, thr };
  }

  // moving average over a 1-bar-height window = the rail's low-frequency shape
  function smooth(a, win) {
    const half = Math.max(1, Math.round(win / 2));
    const o = new Array(a.length);
    for (let i = 0; i < a.length; i++) {
      let s = 0, n = 0;
      for (let j = i - half; j <= i + half; j++) { const k = Math.min(a.length - 1, Math.max(0, j)); s += a[k]; n++; }
      o[i] = s / n;
    }
    return o;
  }

  function stats(ys) {
    const lf = smooth(ys, barH);
    const res = ys.map((v, i) => v - lf[i]);
    const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    const lfMean = lf.reduce((s, v) => s + v, 0) / lf.length;
    const rmsHF = rms(res);
    const rmsLF = rms(lf.map((v) => v - lfMean));
    let cross = 0;
    for (let i = 1; i < res.length; i++) if ((res[i - 1] < 0) !== (res[i] < 0)) cross++;
    const tear = cross ? res.length / cross : res.length;
    const abs = res.map(Math.abs).sort((a, b) => a - b);
    const pct = (v) => +(100 * v / barH).toFixed(2);
    return { rmsHF: pct(rmsHF), rmsLF: pct(rmsLF), tear: pct(tear),
      ampP95: pct(abs[Math.floor(abs.length * 0.95)]), meanY: +(ys.reduce((s, v) => s + v, 0) / ys.length).toFixed(1) };
  }

  const T = trace(-1, baseTop), Bo = trace(+1, baseBot);
  const st = stats(T.ys), sb = stats(Bo.ys);
  return { size: [W, H], barH, plateau: +plateau.toFixed(1),
    baseTop: +baseTop.toFixed(1), baseBot: +baseBot.toFixed(1), botBand: [bb[0], bb[1], bbLo, bbHi, botBandInFrame],
    thrTop: +T.thr.toFixed(1), thrBot: +Bo.thr.toFixed(1), top: st, bot: sb,
    ratioHF: +(sb.rmsHF / Math.max(0.001, st.rmsHF)).toFixed(2) };
}, [b64, mime, B, BB]);

console.log(`${file}  ${out.size.join('x')}  barH ${out.barH}px  plateau ${out.plateau}  base ${out.baseTop}/${out.baseBot}  thr ${out.thrTop}/${out.thrBot}`);
for (const k of ['top', 'bot']) {
  const s = out[k];
  console.log(`  ${k} rail  rmsHF ${String(s.rmsHF).padEnd(6)}%bh  rmsLF ${String(s.rmsLF).padEnd(6)}%bh  tear ${String(s.tear).padEnd(6)}%bh  ampP95 ${String(s.ampP95).padEnd(6)}%bh  meanY ${s.meanY}`);
}
console.log(`  rmsHF ratio bot/top ${out.ratioHF}`);
console.log(`  botBand ${out.botBand[0]}-${out.botBand[1]} barH = y${out.botBand[2]}-${out.botBand[3]} of ${out.size[1]}  IN FRAME: ${out.botBand[4]}${out.botBand[4] ? '' : '  <-- baseBot is a FORCED 0, thrBot = plateau/2'}`);
await browser.close();
