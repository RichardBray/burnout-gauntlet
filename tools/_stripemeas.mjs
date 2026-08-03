// Stripe anisotropy of a panel patch. Found in wave-o car-paint (o1).
//
// WHY THIS EXISTS: `_paintmeas.mjs` grainRMSpct is a FIXED 3x3 box high-pass, so its
// cutoff is locked to screen pixels, not to the panel. On reference JPEGs it locks onto
// whatever hard feature is in the crop (a badge edge, a crease streak) and its value RISES
// when you downscale. It cannot be compared across images whose flake scale differs.
//
// This measures something the eye actually reads: is the residual structure on the panel
// ISOTROPIC (real flake sparkle) or VERTICALLY STREAKED (the env probe's own content
// showing through a near-mirror BRDF)? Detrend with a 9x9 box, then compare the std of the
// column means against the std of the row means. anis = col/row.
//
// !! `anis` IS RETIRED. DO NOT QUOTE IT AND DO NOT SET A TARGET ON IT. !!
// `rms(colMeans)/rms(rowMeans)` has an isotropic null of ~sqrt(H/W), not 1.0, because a
// column mean averages H samples and a row mean averages W. It is therefore REGION-SHAPE
// DEPENDENT: the null is ~1.10 at the 90x81 patch and ~1.83 at the 81x35 patch, so the old
// `hi anis <= 1.30` target demanded we score below the null of a differently-shaped patch,
// and it scored a confirmed fix as a 39% regression at 960. Retired in
// `verdicts/wave-p/car-paint.md`, re-proven on three separate grounds in
// `verdicts/wave-q/car-paint.md`; see `tools/STANDING-CONSTRAINTS.md` §1c and §2e.
//   REPLACED BY: `anisAC1` / `anisAC3` (lag-1 / lag-3 column-minus-row autocorrelation of
//   the detrended residual), computed below and control-verified in §1c. `anisAC3` is a
//   NORMALISED correlation and therefore amplitude-blind: never quote it without `resRMS`
//   beside it. Its null on the 44x42 patch used at 960 is -0.08 +/- 0.02, not 0.00.
//   Run every new anisotropy statistic through `tools/_anisonull.mjs` before targeting it.
//
// !! THE ref-04 ANCHORS BELOW ARE RETIRED TOO. THEY ARE KEPT ONLY SO THEY ARE RECOGNISABLE
//    AS DEAD IF YOU MEET THEM IN AN OLD REPORT. !!
//   hi 0.4583 0.5 0.5500 0.5833 -> 0.56    sh 0.4010 0.4320 0.6330 0.6670 -> 0.99
// Cropped and looked at (`verdicts/wave-q/car-paint.md`, §2e of STANDING-CONSTRAINTS):
// ref-04's `hi` patch is dark roof, a hard horizontal white silhouette edge and a
// white/silver graphic spike with essentially no flat paint (`resRMS` 16.55,
// `anisAC3` -0.711); the `sh` patch carries a shadow wedge and a diagonal graphic streak
// (`anisAC3` +0.521, i.e. MORE vertically combed than ours ever measured).
// **NO VALID EXTERNAL ANCHOR EXISTS for stripe anisotropy in this reference set** - and note
// `anisAC` is not cross-quotable between our PNGs and the reference JPEGs at all, because
// JPEG smoothing correlates the residual in both directions at near-unity (ref-04
// `acX1` 0.881). Judge it A/B internally and by eye, on the CAR's hi patch
// `0.1094 0.1563 0.6111 0.6852`.
//
// usage: node tools/_stripemeas.mjs <img> <x0> <x1> <y0> <y1>   (fractional regions)
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [f, x0, x1, y0, y1] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = (await readFile(f)).toString('base64');
const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';

const out = await page.evaluate(async ([data, m, a, b, c, d]) => {
  const img = new Image();
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = `data:${m};base64,${data}`; });
  const W = img.width, H = img.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const X0 = Math.floor(a * W), X1 = Math.floor(b * W);
  const Y0 = Math.floor(c * H), Y1 = Math.floor(d * H);
  const w = X1 - X0, h = Y1 - Y0;
  const px = ctx.getImageData(X0, Y0, w, h).data;

  const lum = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
  }

  // 9x9 box lowpass, then residual. 9 px is wide enough to pass a 3.4 px flake cell
  // through untouched while removing the panel's shading ramp.
  const res = new Float64Array(w * h);
  let mean = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
      s += lum[yy * w + xx]; n++;
    }
    res[y * w + x] = lum[y * w + x] - s / n;
  }
  for (let i = 0; i < w * h; i++) mean += lum[i];
  mean /= w * h;

  let ss = 0;
  for (let i = 0; i < w * h; i++) ss += res[i] * res[i];
  const rms = Math.sqrt(ss / (w * h));

  // Discard a 4 px skirt: those rows/cols saw a clipped lowpass kernel.
  const colMeans = [], rowMeans = [];
  for (let x = 4; x < w - 4; x++) {
    let s = 0, n = 0;
    for (let y = 4; y < h - 4; y++) { s += res[y * w + x]; n++; }
    colMeans.push(s / n);
  }
  for (let y = 4; y < h - 4; y++) {
    let s = 0, n = 0;
    for (let x = 4; x < w - 4; x++) { s += res[y * w + x]; n++; }
    rowMeans.push(s / n);
  }
  const sd = (v) => {
    const mu = v.reduce((p, q) => p + q, 0) / v.length;
    return Math.sqrt(v.reduce((p, q) => p + (q - mu) * (q - mu), 0) / v.length);
  };
  const col = sd(colMeans), row = sd(rowMeans);

  // ---- anisAC: shape-independent replacement for `anis` (wave-p audit) --------------
  // `anis` = sd(colMeans)/sd(rowMeans) is NOT 1.0 for isotropic noise. A column mean
  // averages `nRows` samples and a row mean averages `nCols`, so for white noise
  // anis -> sqrt(nCols/nRows). Measured on four synthetic isotropic-noise frames, the
  // null is 1.23 +/- 0.08 for a 90x81 patch and 1.82 +/- 0.29 for a 79x40 patch — and the
  // published ref-04 anchors were taken on 81x39 / 60x41 patches while ours are 90x81, so
  // the two are not the same statistic. Worse, the single-realisation spread swamps the
  // signal once the patch is downscaled to 960 (null spread 0.79-1.68 on the same shape),
  // which makes `anis` useless as a scale-persistence check.
  //
  // anisAC compares the lag-k autocorrelation of the residual DOWN a column against the
  // same lag ACROSS a row. Both are 0 for isotropic noise regardless of patch shape or
  // size, both are bounded, and a vertical stripe drives acY up while leaving acX at or
  // below 0. Report acY - acX; > ~0.15 is a visible vertical comb.
  const acDir = (dx, dy) => {
    let s = 0, n = 0;
    for (let y = 4; y < h - 4 - dy; y++) for (let x = 4; x < w - 4 - dx; x++) {
      s += res[y * w + x] * res[(y + dy) * w + x + dx]; n++;
    }
    let v = 0, m = 0;
    for (let y = 4; y < h - 4; y++) for (let x = 4; x < w - 4; x++) { v += res[y * w + x] ** 2; m++; }
    return (s / n) / Math.max(v / m, 1e-9);
  };
  const acY1 = acDir(0, 1), acX1 = acDir(1, 0);
  const acY3 = acDir(0, 3), acX3 = acDir(3, 0);

  // Bright/dark speck balance at a mean-relative threshold, so it survives an exposure move.
  let neg = 0, pos = 0;
  const t = 0.035 * mean;
  for (let i = 0; i < w * h; i++) { if (res[i] < -t) neg++; if (res[i] > t) pos++; }
  let s3 = 0;
  for (let i = 0; i < w * h; i++) s3 += res[i] ** 3;

  return {
    size: [w, h],
    mean: +mean.toFixed(1),
    resRMS: +rms.toFixed(2),
    colStripe: +col.toFixed(2),
    rowStripe: +row.toFixed(2),
    anis: +(col / Math.max(row, 1e-6)).toFixed(2),
    acY1: +acY1.toFixed(3), acX1: +acX1.toFixed(3),
    anisAC1: +(acY1 - acX1).toFixed(3),
    anisAC3: +(acY3 - acX3).toFixed(3),
    skew: +((s3 / (w * h)) / Math.max(rms ** 3, 1e-9)).toFixed(2),
    darkPct: +(100 * neg / (w * h)).toFixed(2),
    brightPct: +(100 * pos / (w * h)).toFixed(2),
  };
}, [b64, mime, x0, x1, y0, y1]);

console.log(f, JSON.stringify(out, null, 1));
await browser.close();
